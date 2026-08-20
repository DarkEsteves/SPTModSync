"""
ModSync v0.1 - Beta
App desktop PyWebView para partilhar mods SPT entre peers, sem browser.

Fluxo:
- Publish: seleciona ficheiros (árvore), empacota em .zip, upload chunked ao server.
- Update: recebe patches do server (versions.json + download + delete + extract).
- Auto-update da própria app via GitHub Releases (skill update-normal).
- Server Flask embutido: corre dentro da app (Data/Server/server.py, em thread).

Padrão híbrido (igual TarkovCraftApp): http.server 8765 serve index.html+assets
(embutidos no exe) e Data/ (externo, editável). INI e Server/ ficam junto ao exe.
"""
import os
import sys
import json
import time
import subprocess
import threading
import zipfile
import tempfile
import configparser
import shutil
from http.server import HTTPServer, SimpleHTTPRequestHandler

import webview
import requests

VERSION = "v0.6"
GITHUB_REPO = "DarkEsteves/MyApps"
APP_NAME = "SPT Mod Sync"
APP_TITLE = "SPT Mod Sync v0.6 - Beta"
PORT = 8765
CHUNK_SIZE = 64 * 1024 * 1024  # 64MB (igual ao server)

# ---- Paths (frozen vs dev) ----
if getattr(sys, "frozen", False):
    BUNDLE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

DATA_DIR = os.path.join(EXE_DIR, "Data")
INI_PATH = os.path.join(EXE_DIR, "SPTModSync.ini")  # mesmo nome da app/exe (nunca empacotado)
LOG_DIR = os.path.join(DATA_DIR, "Logs")
CRASH_LOG_PATH = os.path.join(LOG_DIR, "crash.log")
PATCH_DIR = os.path.join(DATA_DIR, "Patches")
PATCH_PROGRESS = {"pct": 0, "done": False, "error": None, "info": None, "active": False}


def _write_crash_log(exc_type, exc_value, exc_traceback):
    """Escreve erros não apanhados em Data/Logs/crash.log (independente do log system)."""
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        import traceback as tb
        with open(CRASH_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] CRASH: {exc_type.__name__}: {exc_value}\n")
            f.write("".join(tb.format_exception(exc_type, exc_value, exc_traceback)))
            f.write("\n")
    except Exception:
        pass


sys.excepthook = _write_crash_log

# ---- Sistema de log (estilo detector.py do user, com i18n PT/EN) ----
MAX_LOG_SIZE = 2 * 1024 * 1024  # 2MB por ficheiro, depois roda
_log_file = None
LOG_BUFFER = []  # guarda as últimas linhas em memória para a UI (painel terminal)
LOG_BUFFER_MAX = 400
LOG_LANG = "pt-pt"  # idioma atual dos logs (definido pela UI)

LOG_STRINGS = {
    "pt-pt": {
        "server_start": "Servidor de patches iniciado na porta 8080",
        "server_start_err": "Erro ao iniciar o servidor: %s",
        "server_stop": "Servidor de patches parado",
        "publish_upload_err": "Publicação falhou (upload): %s",
        "publish_reg_err": "Publicação falhou (registo): %s",
        "publish_done": "Patch publicado: v%s (%s itens) -> %s",
        "publish_err": "Erro na publicação: %s",
        "update_start": "A iniciar actualização para v%s <- %s",
        "update_done": "Actualização aplicada: v%s <- %s",
        "update_err": "Erro na actualização: %s",
        "upload_done": "Upload concluído: %s MB em %ss (%s MB/s) -> %s",
        "download_done": "Download concluído: %s MB em %ss (%s MB/s) de %s",
        "download_start": "Download iniciado de %s",
        "server_dl": "Download servido: %s (%s MB) em %ss (%s MB/s) | IP=%s",
        "server_dl_err": "Erro ao servir ficheiro %s | IP=%s",
    },
    "en": {
        "server_start": "Patch server started on port 8080",
        "server_start_err": "Error starting server: %s",
        "server_stop": "Patch server stopped",
        "publish_upload_err": "Publish failed (upload): %s",
        "publish_reg_err": "Publish failed (register): %s",
        "publish_done": "Patch published: v%s (%s items) -> %s",
        "publish_err": "Publish error: %s",
        "update_start": "Starting update to v%s <- %s",
        "update_done": "Update applied: v%s <- %s",
        "update_err": "Update error: %s",
        "upload_done": "Upload finished: %s MB in %ss (%s MB/s) -> %s",
        "download_done": "Download finished: %s MB in %ss (%s MB/s) from %s",
        "download_start": "Download started from %s",
        "server_dl": "Served download: %s (%s MB) in %ss (%s MB/s) | IP=%s",
        "server_dl_err": "Error serving file %s | IP=%s",
    },
}

def set_log_lang(lang):
    global LOG_LANG
    if lang in LOG_STRINGS:
        LOG_LANG = lang

def _ts():
    return time.strftime("%Y-%m-%d %H:%M:%S")

def _ensure_log_dir():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
    except Exception:
        pass

def _current_log_path():
    global _log_file
    _ensure_log_dir()
    if _log_file is None:
        _log_file = os.path.join(LOG_DIR, f"modsync_{time.strftime('%Y%m%d_%H%M%S')}.log")
    elif os.path.exists(_log_file) and os.path.getsize(_log_file) > MAX_LOG_SIZE:
        _log_file = os.path.join(LOG_DIR, f"modsync_{time.strftime('%Y%m%d_%H%M%S')}.log")
    return _log_file

def log_event(key, level="INFO", *args):
    """Escreve no ficheiro .\Data\Logs e guarda no buffer da UI.
    key: chave de LOG_STRINGS (traduz conforme LOG_LANG). Se a chave não
    existir, trata key como mensagem literal (fallback).
    level: INFO | OK | WARN | ERR"""
    lang = LOG_STRINGS.get(LOG_LANG, LOG_STRINGS["pt-pt"])
    tmpl = lang.get(key, key)
    try:
        msg = tmpl % args if args else tmpl
    except Exception:
        msg = tmpl
    global LOG_BUFFER
    line = f"[{_ts()}] [{level}] {msg}"
    try:
        with open(_current_log_path(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    LOG_BUFFER.append((level, line))
    if len(LOG_BUFFER) > LOG_BUFFER_MAX:
        LOG_BUFFER = LOG_BUFFER[-LOG_BUFFER_MAX:]

def get_logs():
    """Devolve as linhas de log para a UI (painel terminal)."""
    return [{"level": lv, "text": tx} for lv, tx in LOG_BUFFER]

def clear_logs():
    """Esvazia o buffer de log (botão Limpar da UI)."""
    global LOG_BUFFER
    LOG_BUFFER = []
    return {"ok": True}

DEFAULTS = {
    "server_ip": "127.0.0.1:8080",
    "spt_path": r"J:\Jogos\SPT-4.0.13",
    "installed_version": "0.0.0",
    "language": "pt-pt",
    "server_on": "false",
    "check_app_update_on_start": "false",
    "geometry": "300,200,1100,780",
}

_server = None        # make_server (werkzeug) do servidor embutido
_server_thread = None # thread que corre o servidor
_server_running = False  # flag explícita do estado (mais fiável que is_alive)
_window = None  # referência à janela (para evaluate_js)
_updating = False


def safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
    except (UnicodeEncodeError, UnicodeDecodeError):
        try:
            print(" ".join(str(a) for a in args).encode("cp1252", "replace").decode("cp1252"), **kwargs)
        except Exception:
            pass


# ---------------- INI ----------------
def load_ini():
    # Migração de nome de ficheiro: modsync.ini -> SPTModSync.ini (mesmo nome da app/exe)
    old_ini = os.path.join(EXE_DIR, "modsync.ini")
    if os.path.exists(old_ini) and not os.path.exists(INI_PATH):
        try:
            os.rename(old_ini, INI_PATH)
        except Exception:
            pass
    cfg = configparser.ConfigParser()
    if os.path.exists(INI_PATH):
        try:
            cfg.read(INI_PATH, encoding="utf-8")
        except Exception:
            pass
    # Migração de secção: [ModSync] -> [SPTModSync]
    if "ModSync" in cfg and "SPTModSync" not in cfg:
        cfg["SPTModSync"] = cfg["ModSync"]
        del cfg["ModSync"]
        save_ini(cfg)
    if "SPTModSync" not in cfg:
        cfg["SPTModSync"] = {}
    for k, v in DEFAULTS.items():
        if k not in cfg["SPTModSync"]:
            cfg["SPTModSync"][k] = v
    set_log_lang(cfg.get("SPTModSync", "language", fallback=DEFAULTS.get("language", "pt-pt")))
    return cfg


def save_ini(cfg):
    try:
        with open(INI_PATH, "w", encoding="utf-8") as f:
            cfg.write(f)
    except Exception as e:
        safe_print("[INI] falhou ao gravar:", e)


# ---------------- Server control (toggle) ----------------
def start_server():
    """Corre o server Flask DENTRO da app (thread), sem abrir janela nova.
    Em exe (frozen) o server.py vem de DENTRO do próprio exe (sys._MEIPASS).
    Em dev é lido de Source/Data/Server/server.py."""
    global _server, _server_thread, _server_running
    if _server_running:
        return {"ok": True, "msg": "já a correr"}
    try:
        import importlib.util
        from werkzeug.serving import make_server
        if getattr(sys, "frozen", False):
            server_py = os.path.join(sys._MEIPASS, "Data", "Server", "server.py")
        else:
            server_py = os.path.join(BUNDLE_DIR, "Data", "Server", "server.py")
        if not os.path.isfile(server_py):
            return {"ok": False, "error": f"server.py não existe: {server_py}"}
        spec = importlib.util.spec_from_file_location("modsync_server", server_py)
        srv = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(srv)
        # Injeta o log_event da app no server para que os logs do Flask
        # (incl. IP/tempo/velocidade de downloads) apareçam no terminal da UI.
        srv.log_event = log_event
        srv._injected_log_event = log_event
        _server = make_server("0.0.0.0", 8080, srv.app, threaded=True)
        _server_thread = threading.Thread(target=_server.serve_forever, daemon=True)
        _server_thread.start()
        _server_running = True
        log_event("server_start", "OK")
        return {"ok": True}
    except Exception as e:
        _server_running = False
        log_event("server_start_err", "ERR", str(e))
        return {"ok": False, "error": str(e)}


def stop_server():
    global _server, _server_thread, _server_running
    _server_running = False
    if _server is not None:
        try:
            _server.shutdown()
        except Exception:
            pass
        _server = None
        _server_thread = None
    log_event("server_stop", "INFO")
    return {"ok": True}


def _norm_host(ip):
    ip = (ip or "").strip()
    if ip.lower().startswith("http://"):
        ip = ip[len("http://"):]
    elif ip.lower().startswith("https://"):
        ip = ip[len("https://"):]
    return ip.rstrip("/")


# ---------------- API (JS via pywebview) ----------------
class Api:
    def __init__(self):
        self.cfg = load_ini()

    def get_config(self):
        return dict(self.cfg["SPTModSync"])

    def get_app_version(self):
        return VERSION

    def save_config(self, data):
        for k, v in data.items():
            self.cfg["SPTModSync"][k] = str(v)
        save_ini(self.cfg)
        return {"ok": True}

    def set_server_running(self, running):
        # Liga/desliga o servidor AGORA (runtime). NÃO grava o autostart.
        running = bool(running)
        if running:
            return start_server()
        return stop_server()

    def get_server_status(self):
        return {"running": bool(_server_running)}

    def browse_folder(self):
        """Abre o diálogo de seleção de pasta (SPT) e devolve o caminho escolhido."""
        import webview
        try:
            if webview.windows:
                result = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
                if result and len(result) > 0:
                    return {"ok": True, "path": result[0]}
            return {"ok": False, "error": "sem janela"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def detect_spt(self, path):
        """Deteta a versão do SPT (nome da pasta) e a presença do launcher."""
        import re
        info = {"spt_version": "", "launcher": False}
        if not path:
            return info
        info["launcher"] = os.path.isfile(os.path.join(path, "SPT", "SPT.Launcher.exe")) or \
                           os.path.isfile(os.path.join(path, "SPT.Launcher.exe"))
        m = re.search(r"[Ss][Pp][Tt][\s\-.]?(\d+\.\d+\.\d+)", os.path.basename(path.rstrip("/\\")))
        if m:
            info["spt_version"] = m.group(1)
        else:
            # fallback: vê o doorstop (não é a versão do SPT, mas é o melhor disponível)
            dconf = os.path.join(path, "doorstop_config.ini")
            if os.path.isfile(dconf):
                info["spt_version"] = "detetado"
        return info

    # ── File tree ──
    def list_dir(self, path=None):
        spt = self.cfg["SPTModSync"].get("spt_path", "")
        if not path:
            path = spt
        abs_path = path if os.path.isabs(path) else os.path.join(spt, path)
        if not os.path.isdir(abs_path):
            return {"ok": False, "error": f"pasta não existe: {abs_path}"}
        try:
            entries = []
            for name in os.listdir(abs_path):
                full = os.path.join(abs_path, name)
                is_dir = os.path.isdir(full)
                rel = os.path.relpath(full, spt) if spt else name
                entries.append({"name": name, "is_dir": is_dir, "rel_path": rel.replace("\\", "/")})
            entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
            return {"ok": True, "path": abs_path, "items": entries}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def list_descendants(self, rel_path):
        """Devolve todos os ficheiros/pastas descendentes de uma pasta (recursivo).
        Usado para seleção recursiva na árvore."""
        spt = self.cfg["SPTModSync"].get("spt_path", "")
        abs_path = rel_path if os.path.isabs(rel_path) else os.path.join(spt, rel_path)
        if not os.path.isdir(abs_path):
            return {"ok": False, "error": f"pasta não existe: {abs_path}"}
        try:
            items = []
            for root, dirs, files in os.walk(abs_path):
                for name in dirs + files:
                    full = os.path.join(root, name)
                    rel = os.path.relpath(full, spt).replace("\\", "/")
                    items.append(rel)
            return {"ok": True, "items": items}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ── Publish: cria zip + upload chunked + register ──
    def make_patch(self, selected_paths, version):
        global PATCH_PROGRESS
        if not selected_paths:
            return {"ok": False, "error": "Nenhum ficheiro selecionado"}
        if not version:
            version = "1.0.0"
        spt = self.cfg["SPTModSync"].get("spt_path", "")
        if not spt:
            return {"ok": False, "error": "Falta a pasta SPT"}

        PATCH_PROGRESS = {"pct": 0, "done": False, "error": None, "info": None, "active": True, "file": ""}

        def run():
            global PATCH_PROGRESS
            try:
                os.makedirs(PATCH_DIR, exist_ok=True)
                zip_path = os.path.join(PATCH_DIR, f"Patch-{version}.zip")
                self._create_zip(selected_paths, spt, progress_cb=lambda p, fn: PATCH_PROGRESS.update({"pct": p, "file": fn}), out_path=zip_path)
                size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 1)
                modified = time.strftime("%Y-%m-%d %H:%M:%S")
                info = {
                    "zip_path": zip_path,
                    "filename": os.path.basename(zip_path),
                    "size": size_mb,
                    "items": len(selected_paths),
                    "modified": modified,
                    "version": version,
                }
                PATCH_PROGRESS = {"pct": 100, "done": True, "error": None, "info": info, "active": False}
                _emit("patch_progress", {"pct": 100, "done": True, "info": info})
            except Exception as e:
                PATCH_PROGRESS = {"pct": 0, "done": True, "error": str(e), "info": None, "active": False}
                _emit("patch_progress", {"pct": 0, "error": str(e)})
                log_event("publish_err", "ERR", str(e))

        threading.Thread(target=run, daemon=True).start()
        return {"ok": True, "status": "starting"}

    def get_patch_progress(self):
        return dict(PATCH_PROGRESS)

    def patch_exists(self):
        # procura o zip do patch mais recente (Patch-*.zip)
        if not os.path.isdir(PATCH_DIR):
            return {"exists": False, "path": ""}
        try:
            zips = [f for f in os.listdir(PATCH_DIR) if f.lower().startswith("patch-") and f.lower().endswith(".zip")]
            if not zips:
                return {"exists": False, "path": ""}
            zips.sort(key=lambda f: os.path.getmtime(os.path.join(PATCH_DIR, f)), reverse=True)
            newest = os.path.join(PATCH_DIR, zips[0])
            size_mb = round(os.path.getsize(newest) / (1024 * 1024), 1)
            modified = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(newest)))
            return {"exists": True, "path": newest, "filename": zips[0], "size": size_mb, "modified": modified}
        except Exception:
            return {"exists": False, "path": ""}

    def publish_from_patch(self, patch_info, version, changelog):
        if not patch_info or not patch_info.get("ok"):
            return {"ok": False, "error": "Faz primeiro o patch"}
        zip_path = patch_info.get("zip_path") or self.patch_exists().get("path")
        if not zip_path or not os.path.isfile(zip_path):
            return {"ok": False, "error": "O zip do patch já não existe. Faz o patch novamente."}
        fname = patch_info.get("filename") or os.path.basename(zip_path)
        # Enviar para o servidor LOCAL (127.0.0.1:8080), não para o IP do colega
        host = "127.0.0.1:8080"

        def run():
            try:
                _emit("publish_progress", {"msg": "A enviar...", "pct": 10})
                res = self._upload_chunked(zip_path, host)
                if not res["ok"]:
                    _emit("publish_progress", {"msg": "❌ " + res.get("error", "erro"), "pct": 0, "error": True})
                    log_event("publish_upload_err", "ERR", res.get("error", "erro"))
                    return
                _emit("publish_progress", {"msg": "A registar versão...", "pct": 95})
                reg = self._register_version(host, fname, version, changelog)
                if not reg["ok"]:
                    _emit("publish_progress", {"msg": "❌ " + reg.get("error", "erro"), "pct": 0, "error": True})
                    log_event("publish_reg_err", "ERR", reg.get("error", "erro"))
                    return
                _emit("publish_progress", {"msg": "✔ Publicado!", "pct": 100, "done": True})
                log_event("publish_done", "OK", version, patch_info.get("items", 0), host)
            except Exception as e:
                _emit("publish_progress", {"msg": "❌ " + str(e), "pct": 0, "error": True})
                log_event("publish_err", "ERR", str(e))
            finally:
                try:
                    if zip_path and os.path.exists(zip_path):
                        os.unlink(zip_path)
                except Exception:
                    pass

        threading.Thread(target=run, daemon=True).start()
        return {"ok": True, "status": "starting"}

    def publish(self, selected_paths, version, changelog):
        if not selected_paths:
            return {"ok": False, "error": "Nenhum ficheiro selecionado"}
        if not version:
            return {"ok": False, "error": "Falta a versão"}
        spt = self.cfg["SPTModSync"].get("spt_path", "")
        host = _norm_host(self.cfg["SPTModSync"].get("server_ip", ""))
        if not host:
            return {"ok": False, "error": "Falta o IP do servidor"}

        def run():
            try:
                _emit("publish_progress", {"msg": "A empacotar...", "pct": 5})
                zip_path = self._create_zip(selected_paths, spt)
                _emit("publish_progress", {"msg": "A enviar...", "pct": 10})
                res = self._upload_chunked(zip_path, host)
                if not res["ok"]:
                    _emit("publish_progress", {"msg": "❌ " + res.get("error", "erro"), "pct": 0, "error": True})
                    log_event("publish_upload_err", "ERR", res.get("error", "erro"))
                    return
                _emit("publish_progress", {"msg": "A registar versão...", "pct": 95})
                reg = self._register_version(host, res["filename"], version, changelog)
                if not reg["ok"]:
                    _emit("publish_progress", {"msg": "❌ " + reg.get("error", "erro"), "pct": 0, "error": True})
                    log_event("publish_reg_err", "ERR", reg.get("error", "erro"))
                    return
                _emit("publish_progress", {"msg": "✔ Publicado!", "pct": 100, "done": True})
                log_event("publish_done", "OK", version, len(selected_paths), host)
            except Exception as e:
                _emit("publish_progress", {"msg": "❌ " + str(e), "pct": 0, "error": True})
                log_event("publish_err", "ERR", str(e))
            finally:
                try:
                    if 'zip_path' in locals() and os.path.exists(zip_path):
                        os.unlink(zip_path)
                except Exception:
                    pass

        threading.Thread(target=run, daemon=True).start()
        return {"ok": True, "status": "starting"}

    def _create_zip(self, selected_paths, spt, progress_cb=None, out_path=None):
        if out_path:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            if os.path.exists(out_path):
                os.remove(out_path)
            zip_path = out_path
        else:
            tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
            zip_path = tmp.name
            tmp.close()

        # Remove itens que são descendentes de uma pasta já selecionada
        # (evita duplicados no zip quando a seleção é recursiva)
        sel_set = set(selected_paths)
        clean = []
        for rel in selected_paths:
            parts = rel.split("/")
            covered = False
            for i in range(1, len(parts)):
                parent = "/".join(parts[:i])
                if parent in sel_set:
                    covered = True
                    break
            if not covered:
                clean.append(rel)
        selected_paths = clean

        # Conta total de ficheiros primeiro para calcular o progresso
        total_files = 0
        for rel in selected_paths:
            full = os.path.join(spt, rel)
            if os.path.isdir(full):
                for root, dirs, files in os.walk(full):
                    total_files += len(files)
            elif os.path.isfile(full):
                total_files += 1
        done = 0
        zf = zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED)
        for rel in selected_paths:
            full = os.path.join(spt, rel)
            if os.path.isdir(full):
                for root, dirs, files in os.walk(full):
                    for fn in files:
                        fp = os.path.join(root, fn)
                        arc = os.path.relpath(fp, spt).replace("\\", "/")
                        zf.write(fp, arc)
                        done += 1
                        if progress_cb and total_files:
                            progress_cb(int(done / total_files * 100), arc)
            elif os.path.isfile(full):
                zf.write(full, rel.replace("\\", "/"))
                done += 1
                if progress_cb and total_files:
                    progress_cb(int(done / total_files * 100), rel.replace("\\", "/"))
        zf.close()
        if progress_cb:
            progress_cb(100, "")
        return zip_path

    def _upload_chunked(self, zip_path, host):
        fname = os.path.basename(zip_path)
        size = os.path.getsize(zip_path)
        total = max(1, (size + CHUNK_SIZE - 1) // CHUNK_SIZE)
        base = f"http://{host}"
        t0 = time.time()
        with open(zip_path, "rb") as f:
            for i in range(total):
                chunk = f.read(CHUNK_SIZE)
                ok = False
                for att in range(3):
                    try:
                        r = requests.post(
                            f"{base}/upload-chunk",
                            files={"file": (fname, chunk)},
                            data={"filename": fname, "chunk_index": str(i)},
                            timeout=300,
                        )
                        if r.status_code == 200:
                            ok = True
                            break
                    except Exception:
                        time.sleep(2)
                if not ok:
                    return {"ok": False, "error": f"Chunk {i+1}/{total} falhou"}
                pct = 10 + round((i + 1) / total * 85)
                _emit("publish_progress", {"msg": f"A enviar... {i+1}/{total}", "pct": pct})
        elapsed = max(0.01, time.time() - t0)
        size_mb = size / (1024 * 1024)
        speed = size_mb / elapsed
        log_event("upload_done", "OK", f"{size_mb:.1f}", f"{elapsed:.1f}", f"{speed:.2f}", host)
        return {"ok": True, "filename": fname}

    def _register_version(self, host, filename, version, changelog):
        try:
            r = requests.post(
                f"http://{host}/register-version",
                json={
                    "version": version,
                    "filename": filename,
                    "changelog": changelog,
                    "files_to_delete": [],
                    "server_ip": host,
                },
                timeout=30,
            )
            if r.status_code == 200:
                return {"ok": True}
            return {"ok": False, "error": f"register falhou ({r.status_code})"}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def _emit(event, data):
    global _window
    try:
        if _window is not None:
            _window.evaluate_js(f"window.__modsync_emit({event}, {json.dumps(data)})")
    except Exception:
        pass


# Caminho do zip do patch já descarregado (partilhado entre download e install).
_update_zip_path = None


# ---------------- Update de mods (receber patches do server) ----------------
class _Updater:
    """Lógica de update de mods (download + delete + extract)."""

    @staticmethod
    def _semver(v):
        try:
            return tuple(map(int, str(v).lstrip("vV").split(".")))
        except Exception:
            return (0,)

    @staticmethod
    def check(spt_host, installed):
        host = _norm_host(spt_host)
        try:
            r = requests.get(f"http://{host}/versions.json", timeout=15)
            versions = r.json()
            current = _Updater._semver(installed)
            latest = None
            for v in versions:
                ver = _Updater._semver(v.get("Version", "0"))
                if ver > current and (latest is None or ver > _Updater._semver(latest["Version"])):
                    latest = v
            return {"ok": True, "current": installed, "update": latest is not None, "latest": latest}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @staticmethod
    def download(spt_host, version_entry):
        """Faz apenas o download do patch para um ficheiro temporário.
        Emite update_progress com phase='download'. Não instala."""
        global _update_zip_path
        host = _norm_host(spt_host)
        tmp_path = None
        try:
            url = version_entry["Download"]
            if not url.lower().startswith("http"):
                url = f"http://{host}{url}"
            _emit("update_progress", {"phase": "download", "msg": "A descarregar...", "pct": 0})
            log_event("download_start", "INFO", host)
            t0 = time.time()
            tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
            tmp_path = tmp.name
            tmp.close()
            with requests.get(url, stream=True, timeout=120) as r:
                total = int(r.headers.get("Content-Length", 0) or 0)
                done = 0
                with open(tmp_path, "wb") as f:
                    for chunk in r.iter_content(8192):
                        if not chunk:
                            continue
                        f.write(chunk)
                        done += len(chunk)
                        if total:
                            elapsed = max(0.01, time.time() - t0)
                            size_mb = done / (1024 * 1024)
                            speed = size_mb / elapsed
                            _emit("update_progress", {
                                "phase": "download",
                                "msg": "A descarregar...",
                                "pct": int(done / total * 100),
                                "size_mb": round(size_mb, 1),
                                "speed_mb_s": round(speed, 2),
                            })
            _update_zip_path = tmp_path
            elapsed = max(0.01, time.time() - t0)
            size_mb = done / (1024 * 1024)
            speed = size_mb / elapsed
            _emit("update_progress", {
                "phase": "download",
                "msg": "✔ Download concluído",
                "pct": 100,
                "size_mb": round(size_mb, 1),
                "speed_mb_s": round(speed, 2),
                "done": True,
            })
            log_event("download_done", "OK", f"{size_mb:.1f}", f"{elapsed:.1f}", f"{speed:.2f}", host)
            return {"ok": True}
        except Exception as e:
            if tmp_path and os.path.exists(tmp_path):
                try: os.unlink(tmp_path)
                except Exception: pass
            _update_zip_path = None
            _emit("update_progress", {"phase": "download", "msg": "❌ " + str(e), "pct": 0, "error": True})
            log_event("download_err", "ERR", str(e))
            return {"ok": False, "error": str(e)}

    @staticmethod
    def install(spt_path, version_entry, installed):
        """Instala o patch já descarregado (_update_zip_path): apaga obsoletos e extrai.
        Emite update_progress com phase='install' e o nome do ficheiro a instalar."""
        global _update_zip_path
        tmp_path = _update_zip_path
        try:
            if not tmp_path or not os.path.isfile(tmp_path):
                _emit("update_progress", {"phase": "install", "msg": "❌ Nenhum patch descarregado", "pct": 0, "error": True})
                return {"ok": False, "error": "Nenhum patch descarregado"}
            # delete files_to_delete
            _emit("update_progress", {"phase": "install", "msg": "A limpar obsoletos...", "pct": 5})
            for rel in version_entry.get("files_to_delete", []) or []:
                target = os.path.join(spt_path, rel.replace("/", os.sep))
                try:
                    if os.path.isfile(target):
                        os.remove(target)
                    elif os.path.isdir(target):
                        shutil.rmtree(target, ignore_errors=True)
                except Exception:
                    pass
            # extract (mostra ficheiro atual)
            _emit("update_progress", {"phase": "install", "msg": "A instalar...", "pct": 20})
            with zipfile.ZipFile(tmp_path, "r") as zf:
                names = zf.namelist()
                total = max(1, len(names))
                for i, name in enumerate(names):
                    _emit("update_progress", {
                        "phase": "install",
                        "msg": "A instalar: " + name,
                        "pct": 20 + int((i + 1) / total * 80),
                    })
                    zf.extract(name, spt_path)
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            _update_zip_path = None
            _emit("update_progress", {
                "phase": "install",
                "msg": "✔ Atualizado para " + version_entry.get("Version", ""),
                "pct": 100,
                "done": True,
            })
            return {"ok": True}
        except Exception as e:
            _emit("update_progress", {"phase": "install", "msg": "❌ " + str(e), "pct": 0, "error": True})
            log_event("install_err", "ERR", str(e))
            return {"ok": False, "error": str(e)}


# ---------------- Auto-update da app (GitHub Releases) ----------------
def _pv(v):
    try:
        return tuple(map(int, str(v).lstrip("vV").split(".")))
    except Exception:
        return (0,)


def check_app_update():
    try:
        r = requests.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases",
            headers={"User-Agent": APP_NAME}, timeout=10,
        )
        if r.status_code == 404:
            return {"current": VERSION, "error": "repo não encontrado", "update": False, "latest": None}
        data = r.json()
        if not isinstance(data, list):
            return {"current": VERSION, "error": str(data.get("message", "erro"))[:60], "update": False, "latest": None}
        current = _pv(VERSION)
        latest_ver, latest_url = None, None
        for rel in data:
            if rel.get("draft") or rel.get("prerelease"):
                continue
            tag = rel.get("tag_name", "")
            m = re_search_tag(tag)
            if not m:
                continue
            ver = tuple(map(int, m.split(".")))
            if ver > (latest_ver or (0,)):
                # procura asset zip que corresponda a ESTA app (SPTModSync)
                for asset in rel.get("assets", []):
                    aname = asset["name"].lower()
                    if aname.endswith(".zip") and ("modsync" in aname or "sptmodsync" in aname or "spt-mod-sync" in aname):
                        latest_ver = ver
                        latest_url = asset["browser_download_url"]
                        break
        if latest_ver and latest_ver > current and latest_url:
            return {"current": VERSION, "update": True, "latest": {"version": "v" + ".".join(map(str, latest_ver)), "url": latest_url}}
        return {"current": VERSION, "update": False, "latest": None}
    except Exception as e:
        return {"current": VERSION, "error": str(e)[:60], "update": False, "latest": None}


def re_search_tag(tag):
    import re
    # aceita tags: v1.0, SPTModSync-v1.0, SPTModSync_v1.0, modsync-v1.0, MyApps-v1.0
    m = re.search(r'(?:SPTModSync|SPT[ _-]?Mod[ _-]?Sync|modsync|MyApps)[_-]?v?(\d+\.\d+(?:\.\d+)?)', tag, re.IGNORECASE)
    if m:
        return m.group(1)
    # fallback: versão simples vX.Y.Z
    m = re.search(r'v?(\d+\.\d+(?:\.\d+)?)', tag)
    return m.group(1) if m else None


def download_app_update(url):
    global _updating
    if _updating:
        return {"error": "Já em curso"}
    _updating = True
    threading.Thread(target=_do_app_update, args=(url,), daemon=True).start()
    return {"status": "starting"}


def _do_app_update(asset_url):
    global _updating
    prefix = "modsync"
    try:
        target_dir = EXE_DIR
        _emit("app_update_progress", {"msg": "A descarregar update...", "pct": 0})
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp_path = tmp.name
        tmp.close()
        with requests.get(asset_url, stream=True, headers={"User-Agent": APP_NAME}, timeout=120) as r:
            total = int(r.headers.get("Content-Length", 0) or 0)
            done = 0
            with open(tmp_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        _emit("app_update_progress", {"msg_key": "app_update_downloading", "pct": int(done / total * 60)})
        _emit("app_update_progress", {"msg_key": "app_update_extracting", "pct": 80})
        extract_dir = tempfile.mkdtemp(prefix=f"{prefix}_upd_")
        with zipfile.ZipFile(tmp_path, "r") as zf:
            zf.extractall(extract_dir)
        os.unlink(tmp_path)
        entries = os.listdir(extract_dir)
        content_dir = extract_dir
        if len(entries) == 1 and os.path.isdir(os.path.join(extract_dir, entries[0])):
            content_dir = os.path.join(extract_dir, entries[0])
        bat_path = os.path.join(tempfile.gettempdir(), f"{prefix}_upd.bat")
        lines = [
            "@echo off", "setlocal", "timeout /t 4 /nobreak > nul",
            f'xcopy /E /I /Y "{content_dir}\\*" "{target_dir}\\"',
            f'rd /s /q "{extract_dir}" > nul 2>&1', 'del "%~f0"',
        ]
        with open(bat_path, "w") as bf:
            bf.write("\r\n".join(lines) + "\r\n")
        _emit("app_update_progress", {"msg_key": "app_update_installed", "pct": 100, "done": True, "shutdown": True})
        # fecha a app (a janela) para libertar o exe antes de o batch correr
        try:
            if webview.windows:
                for w in webview.windows:
                    try:
                        w.destroy()
                    except Exception:
                        pass
        except Exception:
            pass
        time.sleep(2)
        try:
            subprocess.Popen(["cmd", "/c", bat_path], creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass
    except Exception as e:
        _emit("app_update_progress", {"msg": "❌ " + str(e), "pct": 0, "error": True})
    finally:
        _updating = False


# ---------------- HTTP server (serve UI + Data) ----------------
class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUNDLE_DIR, **kwargs)

    def translate_path(self, path):
        # /Data/... → EXE_DIR/Data/... (externo, editável)
        if path.startswith("/Data/") or path.startswith("/data/"):
            rel = path.split("/", 2)[-1]
            return os.path.join(DATA_DIR, rel.replace("/", os.sep))
        return super().translate_path(path)

    def log_message(self, *args):
        pass


def start_http_server():
    httpd = HTTPServer(("127.0.0.1", PORT), AppHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# ---------------- Geometria (Win32 por PID) ----------------
def find_hwnd_by_pid(pid):
    import ctypes
    from ctypes import wintypes
    if os.name != "nt" or not pid:
        return None
    try:
        user32 = ctypes.windll.user32
        result = []

        def _enum(hwnd, _):
            if not user32.IsWindowVisible(hwnd):
                return True
            pb = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pb))
            if pb.value == pid:
                result.append(hwnd)
            return True

        user32.EnumWindows(ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(_enum), 0)
        return result[0] if result else None
    except Exception:
        return None


def get_window_rect(pid=None):
    import ctypes
    from ctypes import wintypes
    if os.name != "nt":
        return None
    try:
        user32 = ctypes.windll.user32
        hwnd = find_hwnd_by_pid(pid)
        if not hwnd:
            return None
        r = wintypes.RECT()
        if user32.GetWindowRect(hwnd, ctypes.byref(r)):
            return (r.left, r.top, r.right - r.left, r.bottom - r.top)
    except Exception:
        pass
    return None


def set_window_geometry(pid, x, y, w, h):
    import ctypes
    if os.name != "nt":
        return
    try:
        user32 = ctypes.windll.user32
        hwnd = find_hwnd_by_pid(pid)
        if hwnd:
            user32.MoveWindow(hwnd, x, y, w, h, True)
    except Exception:
        pass


# ---------------- Expõe update/auto-update na Api ----------------
def _api_check_update(self):
    return _Updater.check(
        self.cfg["SPTModSync"].get("server_ip", ""),
        self.cfg["SPTModSync"].get("installed_version", "0.0.0"),
    )


def _api_do_update(self):
    """Mantido por compatibilidade: faz download + install numa vez (fluxo antigo)."""
    spt_host = self.cfg["SPTModSync"].get("server_ip", "")
    installed = self.cfg["SPTModSync"].get("installed_version", "0.0.0")
    spt_path = self.cfg["SPTModSync"].get("spt_path", "")
    res = _Updater.check(spt_host, installed)
    if not res.get("ok"):
        _emit("update_progress", {"msg": "❌ " + res.get("error", "erro"), "pct": 0, "error": True})
        return res
    if not res.get("update"):
        _emit("update_progress", {"msg": "Estás em dia.", "pct": 100, "done": True})
        return res
    latest = res["latest"]
    _Updater.download(spt_host, latest)
    r = _Updater.install(spt_path, latest, installed)
    if r.get("ok"):
        self.cfg["SPTModSync"]["installed_version"] = latest.get("Version", installed)
        save_ini(self.cfg)
    return r


# Versão pendente (guardada entre download e install)
_update_latest = None


def _api_download_update(self):
    """Verifica + descarrega o patch (sem instalar). Ativa o botão Actualizar no fim."""
    global _update_latest
    spt_host = self.cfg["SPTModSync"].get("server_ip", "")
    installed = self.cfg["SPTModSync"].get("installed_version", "0.0.0")
    res = _Updater.check(spt_host, installed)
    if not res.get("ok"):
        _emit("update_progress", {"phase": "download", "msg": "❌ " + res.get("error", "erro"), "pct": 0, "error": True})
        return res
    if not res.get("update"):
        _emit("update_progress", {"phase": "download", "msg": "Estás em dia.", "pct": 100, "done": True})
        return res
    latest = res["latest"]
    _update_latest = latest
    threading.Thread(target=_Updater.download, args=(spt_host, latest), daemon=True).start()
    return {"ok": True, "status": "downloading"}


def _api_install_update(self):
    """Instala o patch descarregado (usa _update_latest + _update_zip_path)."""
    global _update_latest
    if not _update_latest:
        _emit("update_progress", {"phase": "install", "msg": "❌ Nenhum patch descarregado", "pct": 0, "error": True})
        return {"ok": False, "error": "Nenhum patch descarregado"}
    spt_path = self.cfg["SPTModSync"].get("spt_path", "")
    installed = self.cfg["SPTModSync"].get("installed_version", "0.0.0")
    latest = _update_latest

    def _finish():
        time.sleep(1)
        self.cfg["SPTModSync"]["installed_version"] = latest.get("Version", installed)
        save_ini(self.cfg)

    threading.Thread(target=_Updater.install, args=(spt_path, latest, installed), daemon=True).start()
    threading.Thread(target=_finish, daemon=True).start()
    return {"ok": True, "status": "installing"}


def _api_get_logs(self):
    return get_logs()


def _api_set_log_lang(self, lang):
    return set_log_lang(lang)


def _api_close_app(self):
    """Fecha a janela da app de forma limpa (usado após update da própria app)."""
    try:
        if webview.windows:
            for w in webview.windows:
                try:
                    w.destroy()
                except Exception:
                    pass
    except Exception:
        pass
    return {"ok": True}


def _api_clear_logs(self):
    return clear_logs()


def _api_check_app_update(self):
    return check_app_update()


def _api_download_app_update(self, url):
    return download_app_update(url)


Api.check_update = _api_check_update
Api.do_update = _api_do_update
Api.download_update = _api_download_update
Api.install_update = _api_install_update
Api.check_app_update = _api_check_app_update
Api.download_app_update = _api_download_app_update
Api.get_logs = _api_get_logs
Api.clear_logs = _api_clear_logs
Api.set_log_lang = _api_set_log_lang
Api.close_app = _api_close_app


# ---------------- main ----------------
def main():
    global _window
    api = Api()
    cfg = api.cfg["SPTModSync"]
    geometry = cfg.get("geometry", DEFAULTS["geometry"])
    try:
        x, y, w, h = (int(v) for v in geometry.split(","))
    except Exception:
        x, y = 300, 200
    w, h = 613, 1000  # tamanho fixo (aumentado para caber changelog sem scroll)

    start_http_server()
    _pid = os.getpid()

    _window = webview.create_window(
        APP_TITLE,
        url=f"http://127.0.0.1:{PORT}/index.html",
        js_api=api,
        width=w,
        height=h,
        x=x,
        y=y,
        resizable=False,
        background_color="#0d0d0d",
    )

    # Restaura geometria (poll por PID)
    def _restore():
        for _ in range(100):
            if find_hwnd_by_pid(_pid):
                set_window_geometry(_pid, x, y, w, h)
                return
            time.sleep(0.05)

    threading.Thread(target=_restore, daemon=True).start()

    def _on_closed():
        try:
            rect = get_window_rect(_pid)
            if rect:
                nx, ny, nw, nh = rect
                if nw > 0 and nh > 0:
                    cfg["geometry"] = f"{nx},{ny},{nw},{nh}"
                    save_ini(api.cfg)
        except Exception:
            pass
        stop_server()

    _window.events.closed += _on_closed

    # Se o server estava on no ini, arranca-o
    if cfg.get("server_on", "false") == "true":
        start_server()

    webview.start(debug=False)


if __name__ == "__main__":
    main()



