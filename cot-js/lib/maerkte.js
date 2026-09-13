// Welche Märkte auf die Seite kommen, und welche Paare für die Saisonalität.
//
// Geschlüsselt wird über den CFTC-Kontraktcode, nicht über den Namen:
// Namen ändern sich ("NEW ZEALAND DOLLAR" heisst in der Reihe "NZ DOLLAR"),
// Codes nicht. Dieselbe Lehre wie im alten cot-live.js, dort stand sie
// schon: der unscharfe Namensvergleich zog versehentlich das EUR/JPY-Kreuz
// statt des echten EUR/USD.
'use strict';

// commercialIstInsider: Bei Rohstoffen ist der Commercial ein Produzent
// oder Verbraucher mit echtem Wissen über die Ware. Bei Währungen ist er
// überwiegend ein Bank-Swapdesk, der die Gegenseite des Kundenflusses
// lagert. Die Seite schreibt den Unterschied bei jedem Markt dazu.
const MAERKTE = [
  { code: '099741', kurz: 'EUR',  name: 'Euro FX',            commercialIstInsider: false },
  { code: '096742', kurz: 'GBP',  name: 'Britisches Pfund',   commercialIstInsider: false },
  { code: '097741', kurz: 'JPY',  name: 'Japanischer Yen',    commercialIstInsider: false },
  { code: '092741', kurz: 'CHF',  name: 'Schweizer Franken',  commercialIstInsider: false },
  { code: '090741', kurz: 'CAD',  name: 'Kanadischer Dollar', commercialIstInsider: false },
  { code: '232741', kurz: 'AUD',  name: 'Australischer Dollar', commercialIstInsider: false },
  { code: '112741', kurz: 'NZD',  name: 'Neuseeland-Dollar',  commercialIstInsider: false },
  { code: '098662', kurz: 'USD',  name: 'US-Dollar-Index',    commercialIstInsider: false },
  { code: '088691', kurz: 'GOLD', name: 'Gold',               commercialIstInsider: true  },
  { code: '067651', kurz: 'WTI',  name: 'Rohöl WTI',          commercialIstInsider: true  },
  { code: '13874A', kurz: 'SPX',  name: 'E-Mini S&P 500',     commercialIstInsider: false },
];

// Für die Saisonalität. Deckungsgleich mit den Majors der Rangliste,
// plus Gold. Weitere Paare stehen in lib/quellen.js unter YAHOO bereit.
const SAISON_PAARE = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD',
  'AUD/USD', 'NZD/USD', 'XAU/USD',
];

module.exports = { MAERKTE, SAISON_PAARE };
