// Source-qualified third-party credits. No external code is imported by this module.
export const creditsLinks=Object.freeze({
 source:'https://github.com/Luke883i/lumen',
 license:'https://github.com/Luke883i/lumen/blob/main/LICENSE',
 usage:'https://github.com/Luke883i/lumen/blob/main/docs/USAGE_TERMS.md',
 thirdParties:'https://github.com/Luke883i/lumen/blob/main/docs/THIRD_PARTY_NOTICES.md',
 node:'https://github.com/nodejs/node',
 sqlite:'https://www.sqlite.org/',
 koha:'https://github.com/Koha-Community/Koha',
 kohaLicense:'https://github.com/Koha-Community/Koha/blob/main/LICENSE',
 webPush:'https://github.com/web-push-libs/web-push',
 oidc:'https://github.com/panva/openid-client',
 playwright:'https://github.com/microsoft/playwright'
});
export function creditsProjection({kohaConfigured=false,oidcEnabled=false}={}){
 return Object.freeze({
  platform:'Node.js + SQLite',
  koha:kohaConfigured?
    'Koha: connettore API configurato. L’interoperabilità reale va collaudata.':
    'Koha: integrazione API opzionale, non configurata.',
  kohaStatus:kohaConfigured?'configured_unverified':'optional',
  oidc:oidcEnabled?
    'Accesso istituzionale OIDC configurato; collaudo con il provider richiesto.':
    'Accesso istituzionale OIDC opzionale.',
  license:'MIT per il codice originale LUMEN; i componenti esterni conservano le proprie licenze.',
  research:'FOLIO, Evergreen, SLiMS e Invenio ILS sono riferimenti progettuali, non moduli installati.'
 });
}
