# LUMEN

**Open-source webapp bibliotecaria** per studenti, docenti e bibliotecari.
Catalogo, prenotazioni, prestiti locali, proposte d'acquisto, inbox, PWA e
notifiche opzionali. Semplice da avviare in GitHub Codespaces e distribuibile
come *pilot a singola istanza* su Render. LUMEN non dichiara ancora una
certificazione ILS enterprise o 2.000 utenti concorrenti su infrastruttura reale.

## 1. Aprire LUMEN: un comando in Codespaces

1. Apri [questo repository](https://github.com/Luke883i/lumen) → **Code →
   Codespaces → Create codespace** sul branch `main`.
2. L'immagine Node 24 contiene già `node` e `npm`; l'installazione iniziale
   esegue automaticamente `npm ci`.
3. Nella shell del nuovo Codespace esegui:

```bash
npm run dev
```

Si apre il servizio sulla porta **3000** (URL inoltrato da Codespaces).
Mantieni la visibilità **Private** perché la modalità sviluppo usa utenti demo.

| Profilo | Email demo | Password demo |
|---|---|---|
| Studente | `student@lumen.local` | `Demo1234!` |
| Docente | `faculty@lumen.local` | `Demo1234!` |
| Bibliotecario | `librarian@lumen.local` | `Demo1234!` |

Un Codespace creato prima dell'aggiornamento del devcontainer potrebbe mostrare
`npm: command not found`: esegui **Codespaces: Rebuild Container** e verifica
`bash scripts/doctor.sh`. `git pull` da solo non installa Node/npm.

**Controlli opzionali (non necessari per usare l'app):**

```bash
npm run check
npm test
npm run check:licenses
npm run verify:boot
npm run verify:deploy
```

Per i test Chromium desktop/Android emulato consulta
[browser/README.md](browser/README.md).

## 2. Distribuire su Render

Usa **Render → New → Blueprint** con `main` e il
[`render.yaml`](render.yaml) in radice. Imposta i segreti
`ADMIN_EMAIL` e `ADMIN_PASSWORD` nell'interfaccia Render.
Il Blueprint installa tramite `npm ci`, controlla test e sintassi, poi
avvia **`npm start`** (preflight obbligatorio) e monta SQLite su
`/var/data/lumen.sqlite`.

Dopo lo stato **Live**, dal checkout del commit effettivamente distribuito:

```bash
EXPECTED_SHA=$(git rev-parse HEAD) npm run verify:remote -- https://YOUR-SERVICE.onrender.com
```

**Importante:** disco persistente + una sola istanza significano che questo
Blueprint non è alta disponibilità. Esegui backup cifrato fuori da Render,
prova di restore e test di sicurezza prima di usare dati reali.
[Runbook e DoD](docs/BOOT_DEPLOY.md) ·
[Gate di rilascio](docs/RELEASE_GATES.md).

## 3. Cosa è implementato e chi detiene l'autorità

| Dominio | LUMEN standalone | Collegamento esterno |
|---|---|---|
| Utenti e ruoli | Account locali; bibliotecario, docente, studente | OIDC istituzionale opzionale |
| Catalogo e disponibilità | SQLite, catalogo autonomo e copie locali | Koha bibliografico opzionale |
| Prestiti e prenotazioni | Ciclo di vita locale con ricevute e coda | Koha può essere l'autorità dei propri prestiti |
| Acquisizioni | Proposte dei docenti e gestione bibliotecario | Non promette acquisto completato senza evidenza |
| Comunicazioni | Inbox per utente e categoria | Web Push opzionale (consenso, VAPID, HTTPS) |
| PWA | Browser Android/Windows, installazione se supportata | Nessuna APK nativa/Play Store |
| Verifica | Node tests e Playwright emulato | Koha/IdP/Android fisico da validare |

Le funzionalità Koha sono **disabilitate per default** e richiedono configurazione
OAuth2 e feature flag specifici. R5 verifica le restituzioni dopo il check-in
eseguito su Koha: non inventa una chiamata REST di check-in. 
L'SSO OpenID Connect esiste ma richiede accettazione su IdP reale.

Per configurare: [Koha](docs/KOHA.md),
[prestiti Koha](docs/KOHA_LOANS.md),
[restituzioni Koha](docs/KOHA_RETURNS.md),
[OIDC](docs/OIDC.md),
[Web Push](docs/PUSH_LIFECYCLE.md).

## 4. Licenza, condizioni d'uso e riconoscimenti

**Codice originale LUMEN:** [MIT License](LICENSE), proposta soggetta
all'approvazione dei titolari dei diritti sul codice e sulle icone prima
dell'adozione definitiva. La licenza permette riuso, modifica e ridistribuzione,
anche commerciale, conservando i relativi avvisi, e fornisce il software
senza garanzie.

**Le condizioni d'uso della biblioteca non sono la licenza del software.**
L'istituzione che adotta LUMEN deve pubblicare proprie regole di prestito,
identità, contatti, informative privacy, gestione dati e livelli di servizio.
Vedi [condizioni e responsabilità](docs/USAGE_TERMS.md).

La Home contiene un riconoscimento compatto **Powered by Node.js + SQLite**.
La pagina pubblica `/opensource` collega licenza LUMEN, condizioni e
[licenze dei componenti esterni](docs/THIRD_PARTY_NOTICES.md).
In particolare, [Koha](https://github.com/Koha-Community/Koha)
(GPL-3.0-or-later) è una integrazione API facoltativa, **non** un progetto
vendorizzato o affiliato; [web-push](https://github.com/web-push-libs/web-push)
è MPL-2.0; [openid-client](https://github.com/panva/openid-client) è MIT.
FOLIO, Evergreen, SLiMS e Invenio sono riferimenti studiati, non componenti
installati. [Audit granulare delle 18 PR merged](docs/PR_LINEAGE_AUDIT.md).

Per contribuire: [CONTRIBUTING.md](CONTRIBUTING.md). Non inviare mai dati
personali, endpoint Push, credenziali o token in issue e log pubblici.

## 5. Confini epistemici e sicurezza

Verificato in CI non equivale a produzione certificata. In particolare sono
ancora aperti: prova su Render reale (persistenza/backup/restore), Koha e IdP
istituzionali reali, notifiche/installazione su dispositivi fisici,
accessibilità con tecnologie assistive, privacy/security review e workload
misto di 2.000 concorrenti con resilienza/HA.

[Architettura](docs/DECISIONS.md) ·
[Contratti](docs/CONTRACTS.md) ·
[Tracciabilità source/UX](docs/UX_PROJECTIONS.md) ·
[Operazioni](docs/OPERATIONS.md) ·
[Security audit](docs/SECURITY_BIME.md).

## Informazioni, condizioni d'uso e software open source

Sono disponibili per tutti, anche prima dell'accesso, tre pagine distinte:
`/informazioni` (biblioteca e documenti istituzionali), `/condizioni`
(cosa fanno realmente prestiti, richieste e notifiche) e `/opensource`
(licenza del codice originale LUMEN, librerie effettive e crediti).

Prima del lancio pubblico la biblioteca configura i collegamenti HTTPS alle
proprie condizioni, privacy, accessibilità e assistenza con le variabili
`LUMEN_INSTITUTION_NAME`, `LUMEN_SERVICE_TERMS_URL`,
`LUMEN_PRIVACY_URL`, `LUMEN_ACCESSIBILITY_URL` e
`LUMEN_SUPPORT_URL`. Un dato mancante è dichiarato come **non configurato**,
non sostituito con regole o informative inventate. La licenza software MIT
non disciplina i prestiti e non costituisce consenso o informativa GDPR.
Dettagli: [Information Hub](docs/INFORMATION_HUB.md).

Il [visual audit](docs/VISUAL_RUNTIME_AUDIT.md) cattura screenshot **reali
headless Chromium** per ospite/studente/docente/bibliotecario nelle CI
desktop e Android emulato, con misure e provenienza dei dati al Git SHA.
Un test su browser emulato non dimostra installazione Android fisica,
consegna push, Render reale o 2.000 utenti concorrenti.
