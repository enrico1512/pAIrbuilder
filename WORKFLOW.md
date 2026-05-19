# pAIrbuilder — Workflow operativo per pubblicare una modifica

> Apri questo file quando hai dei dubbi su cosa fare dopo aver modificato qualcosa.

## Regola d'oro

**PC = officina** (qui modifichi, testi, salvi su GitHub).
**Replit = vetrina** (qui scarichi da GitHub e ti aggiorni).
**Mai modificare nei due posti contemporaneamente.**

## La sequenza completa (11 passi)

Dopo che Claude Code (tab Code di Desktop, oppure terminale) ha fatto delle modifiche al codice:

### Fase 1 — Test in locale (sul PC)

| # | Comando | Dove |
|---|---|---|
| 1 | `npm run dev` | Code (PC) |
| 2 | Apri `http://localhost:3000` nel browser | Browser |
| 3 | Verifica la modifica con i tuoi occhi | — |
| 4 | `Ctrl+C` nella shell del server | Code (PC) |

### Fase 2 — Pubblicazione su GitHub (sul PC)

| # | Comando | Dove |
|---|---|---|
| 5 | `git status` (controllo) | Code (PC) |
| 6 | `git add .` | Code (PC) |
| 7 | `git commit -m "feat: descrizione breve"` | Code (PC) |
| 8 | `git push origin main` | Code (PC) |

### Fase 3 — Sincronizzazione di Replit (sul browser)

| # | Comando | Dove |
|---|---|---|
| 9 | `git pull origin main` | Replit (Shell) |
| 10 | `npm install` (solo se package.json è cambiato) | Replit (Shell) |
| 11 | Ferma il server (Ctrl+C) e rilancia con `npm run dev` | Replit (Shell) |
| 12 | Refresh della Preview di Replit | Replit (Preview) |

## Scorciatoie con slash command (sul PC)

Dentro Claude Code (terminale o tab Code), puoi scrivere:

| Scorciatoia | Cosa fa |
|---|---|
| `/test` | Fa i passi 1-3 automatici (avvia server, controlla config, controlla login) |
| `/deploy` | Fa i passi 5-8 e ti scrive il messaggio operativo per Replit |
| `/sync` | All'inizio sessione: ti aggiorna con quello che c'è su GitHub |
| `/db-reset` | Riapplica schema + seed al database (operazione delicata, chiede conferma) |

## Errori comuni e come uscirne

**"Git me lo blocca: divergent branches" su Replit** → vuol dire che qualcuno ha modificato Replit in parallelo. NON forzare il pull. Vieni da Cowork (chat) e ti aiuto a sistemare senza perdere dati.

**Push respinto: "rejected, non-fast-forward"** → qualcuno ha pushato dopo di te. Fai `git pull origin main` sul PC PRIMA di ripetere il push. Se ti dà conflitti, vieni da Cowork.

**Il sito su Replit non riflette le modifiche dopo il pull** → il server è vecchio. Devi davvero fermarlo e riavviarlo (Ctrl+C nella Shell dove sta girando, poi `npm run dev` di nuovo).

**`npm install` su Replit dà errori EBADENGINE** → ignorali, sono solo warning su versioni Node. Se invece dà errori veri (ERR!), copiali e vieni da Cowork.

## NON fare mai

- ❌ `git push --force` su `main` se non sai esattamente cosa stai facendo
- ❌ Modificare i file su Replit e poi continuare a modificarli su PC (= divergenza garantita)
- ❌ Saltare il test in locale prima del push (= bachi pubblicati senza accorgersene)
- ❌ Committare `.env` o `database.txt` (= chiavi segrete su GitHub = brutta cosa)
- ❌ Lanciare `/db-reset` senza prima fare un backup, su un DB con dati veri
