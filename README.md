# SPT Mod Sync

> **Fork / reimplementação** de [Hashimini/SPTMODU-PDATER](https://github.com/Hashimini/SPTMODU-PDATER) + [Hashimini/SPTMODU-PDATERpanel](https://github.com/Hashimini/SPTMODU-PDATERpanel) — portado para uma app desktop nativa em Python/PyWebView, sem browser e sem servidor separado.

---

## Origem / Origin

Este projeto é um **fork funcional** do **MODU-PDATER**, um *mod updater* feito em .NET 8 para sincronizar mods SPT/EFT entre amigos via servidor local. O original é composto por duas partes:

| Componente | Original | Licença |
|---|---|---|
| Launcher (.NET 8) | [Hashimini/SPTMODU-PDATER](https://github.com/Hashimini/SPTMODU-PDATER) | MIT |
| Servidor (Flask) | [Hashimini/SPTMODU-PDATERpanel](https://github.com/Hashimini/SPTMODU-PDATERpanel) | MIT |

Créditos ao autor original **Hashimini** pela ideia, arquitetura de *chunked upload* e pelo formato de *patches* (`versions.json` + zip).

### O que muda neste fork

- **App única em Python/PyWebView** — o launcher e o servidor Flask correm dentro da mesma janela desktop (WebView2), sem abrir browser nem consola separada.
- **Servidor embutido** — o `server.py` original foi integrado e corre em *thread* dentro da app.
- **i18n completo PT-PT / EN** — ficheiros externos `Data/Lang/*.json`.
- **Fluxo "Fazer Patch" + "Publicar"** — separa a criação do zip (local) do envio (upload).
- **Auto-update da própria app** via GitHub Releases (repo `DarkEsteves/MyApps`).

---

## Features / Funcionalidades

- **Publish / Publicar** — seleciona ficheiros na árvore, faz um *patch* (zip local), e envia para o servidor.
- **Update / Actualizar** — recebe patches: descarrega, remove obsoletos, extrai para a pasta SPT.
- **Servidor Flask embutido** — corre dentro da app, sem janela extra.
- **i18n PT-PT / EN** — UI e logs traduzidos, fallback embutido.
- **Auto-update / Auto-atualização** — verifica GitHub Releases e atualiza ao reiniciar.

---

## Build / Compilar

```
pyinstaller SPTModSync.spec
```

O `.spec` empacota `index.html`, `assets/` e `Data/Server/server.py`. Dados externos editáveis (`Data/Lang`, `Data/Logs`, `Data/Patches`) ficam junto ao exe em *runtime*.

---

## Version / Versão

v0.5 - Beta

---

## License / Licença

MIT — herdado do projeto original. Ver [LICENSE](./LICENSE) do repo upstream para os termos completos.
