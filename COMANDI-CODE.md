# Comandi per Claude Code Desktop (e terminale)

> Apri questo file quando non ricordi cosa dire a Claude Code.

## I miei slash command custom

| Comando | Cosa fa |
|---|---|
| `/sync` | Inizio sessione: scarica gli ultimi aggiornamenti da GitHub. |
| `/test` | Avvia il server, controlla config, prova il login demo, conta record DB. |
| `/deploy` | Commit + push su GitHub. Ti scrive il messaggio da incollare su Replit. |
| `/db-reset` | Riapplica schema + seed al DB. Operazione delicata, chiede conferma. |

## Slash command built-in di Claude Code

| Comando | Cosa fa |
|---|---|
| `/help` | Elenco di tutti i comandi disponibili |
| `/clear` | Pulisci la conversazione (CLAUDE.md resta caricato) |
| `/cost` | Mostra il costo della sessione corrente |
| `/model` | Cambia il modello (Sonnet / Opus / Haiku) |
| `/login` | Rilogga se la sessione è scaduta |
| `/logout` | Esci dall'account |
| `/exit` o `/quit` | Chiude Claude Code |

## Frasi in italiano (parla normalmente)

| Voglio... | Scrivi qualcosa tipo... |
|---|---|
| Avviare il sito in locale | "Avvia il server" / "Lancia npm run dev" |
| Fermare il sito | "Ferma il server" |
| Vedere le modifiche non committate | "Mostrami git status" o "cosa è cambiato dall'ultimo commit?" |
| Testare un endpoint backend | "Prova /api/auth/login con i dati demo via curl" |
| Aggiungere una libreria | "Aggiungi la libreria date-fns al progetto" |
| Modificare il colore di un bottone | "Cambia il colore del bottone INIZIA ORA in arancione (file AboutSection)" |
| Leggere un file | "Fammi vedere il file db/schema.ts" |
| Cercare nel progetto | "Cerca dove uso 'GoogleGenAI' nel codice" |
| Annullare modifiche | "Annulla le modifiche non committate" |
| Capire un errore | (incolla errore) "Cosa significa? Come lo risolvo?" |
| Aggiungere un campo a una tabella DB | "Aggiungi alla tabella drinks un campo 'awards' di tipo text array" |
| Generare seed di prova | "Genera 30 piatti italiani di esempio da inserire nel seed" |

## Combo tipiche

### Inizio sessione (sempre)
```
/sync
```

### Dopo aver fatto una modifica (sempre)
```
/test     ← verifichi in locale
/deploy   ← pubblichi su GitHub + ti dice cosa fare su Replit
```

### Sei impazzito e vuoi ripartire da capo
```
git stash       ← (digli "metti via le mie modifiche temporaneamente")
/sync           ← (riparti aggiornato)
```

### Vuoi capire come è messo il progetto
```
"Riassumi la struttura del progetto"
"Quali endpoint ha attualmente il server?"
"Mostra le tabelle del database"
```

## Trucchi

- **Premi Tab** mentre scrivi uno slash command per veder l'autocompletamento
- **Premi ↑** per ripescare comandi precedenti
- **Shift+Tab** approva automaticamente le modifiche di quella sessione (usalo solo quando ti fidi)
- **Ctrl+C** interrompe quello che Claude Code sta facendo (utile se prende una strada sbagliata)
