// Isolated browser fixtures: never read/write the real dashboard's storage or APIs.
const fixtureStorage = new Map();
Object.defineProperty(window, "localStorage", { value: {
  getItem: (key) => fixtureStorage.get(key) ?? null,
  setItem: (key, value) => fixtureStorage.set(key, String(value)),
  removeItem: (key) => fixtureStorage.delete(key),
} });
const fixtureImage = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="teal"/></svg>';
const fixtureRows = (fn, count = 12) => Array.from({ length: count }, (_, i) => fn(i));
const fixtureDate = new Date().toISOString().slice(0, 10);
const fixtureCoins = fixtureRows((i) => ({ id: String(i), name: "Sample coin " + i, symbol: "C" + i, image: fixtureImage, price: 100 + i, current_price: 100 + i, price_change_percentage_24h: i - 6, sparkline_in_7d: { price: [100, 110, 108, 120] } }));
function fixtureData(url) {
  if (url.includes('open-meteo')) return {
    current: { temperature_2m: 22, weather_code: 2 },
    hourly: { time: fixtureRows(i => fixtureDate + 'T' + String(i).padStart(2, '0') + ':00', 24), temperature_2m: Array(24).fill(22), weather_code: Array(24).fill(2) },
    daily: { time: fixtureRows(i => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10), 7), temperature_2m_max: Array(7).fill(25), temperature_2m_min: Array(7).fill(18), weather_code: Array(7).fill(2) },
  };
  if (url.includes('coingecko')) return fixtureCoins;
  if (url.includes('yahoo')) return { chart: { result: [{ meta: { regularMarketPrice: 155, previousClose: 150 }, indicators: { quote: [{ close: [100, 105, 107, 115, 155] }] } }] } };
  if (url.includes('open.er-api')) return { rates: { USD: 1, EUR: .9, GBP: .8, JPY: 145, CHF: .87, CAD: 1.3, AUD: 1.5, TRY: 40, AED: 3.67 } };
  if (url.includes('gold-api')) return { price: 2345.67 };
  if (url.includes('alternative.me')) return { data: fixtureRows(i => ({ value: 45 + i, value_classification: 'Neutral' }), 8) };
  if (url.includes('itunes.apple')) return { feed: { entry: fixtureRows(i => ({ 'im:name': { label: 'A long sample chart title number ' + i }, 'im:artist': { label: 'Artist ' + i }, 'im:image': [{ label: fixtureImage }], summary: { label: '' }, link: { attributes: { href: '#' } } })) } };
  if (url.includes('driverStandings')) return { MRData: { StandingsTable: { StandingsLists: [{ DriverStandings: fixtureRows(i => ({ position: i + 1, points: 100 - i, Driver: { givenName: 'Driver', familyName: 'Sample ' + i }, Constructors: [{ name: 'Racing team ' + i }] }), 20) }] } } };
  if (url.includes('constructorStandings')) return { MRData: { StandingsTable: { StandingsLists: [{ ConstructorStandings: fixtureRows(i => ({ position: i + 1, points: 100 - i, Constructor: { name: 'Racing team ' + i, nationality: 'International' } }), 10) }] } } };
  if (url.includes('ergast')) return { MRData: { RaceTable: { Races: fixtureRows(i => ({ round: i + 1, raceName: 'Grand Prix ' + i, date: fixtureDate, Circuit: { circuitName: 'Sample circuit' }, Results: fixtureRows(j => ({ position: j + 1, Driver: { givenName: 'Driver', familyName: 'Sample ' + j }, Constructor: { name: 'Team ' + j }, status: 'Finished' }), 20) })) }, ConstructorTable: { Constructors: [{ name: 'Red Bull', nationality: 'Austrian' }] } } };
  if (url.includes('thesportsdb')) return {
    events: fixtureRows(i => ({ dateEvent: new Date(Date.now() + Math.floor(i / 2) * 86400000).toISOString().slice(0, 10), strHomeTeam: 'Home team ' + i, strAwayTeam: 'Away team ' + i, strTime: '18:00', intHomeScore: 2, intAwayScore: 1, strVenue: 'Sample stadium' })),
    table: fixtureRows(i => ({ intRank: i + 1, strTeam: 'Team ' + i, intPoints: 45, intPlayed: 25 })),
    teams: [{ strTeam: 'Arsenal', strSport: 'Football', strLeague: 'Premier League', strStadium: 'Sample stadium', strLocation: 'London', strGender: 'Mixed', strLeague2: 'Cup competition', strCountry: 'UK' }],
  };
  if (url.includes('balldontlie')) return { data: fixtureRows(i => ({ first_name: 'Player', last_name: 'Sample ' + i, team: { full_name: 'Team ' + i }, position: 'F' })) };
  if (url.includes('espn')) return { children: [{ name: 'Eastern Conference', standings: { entries: fixtureRows(i => ({ team: { displayName: 'Basketball team ' + i }, stats: [{ name: 'wins', displayValue: '30' }, { name: 'losses', displayValue: '15' }] }), 30) } }], events: fixtureRows(i => ({ competitions: [{ competitors: [{ homeAway: 'home', team: { shortDisplayName: 'Home ' + i }, score: 100 }, { homeAway: 'away', team: { shortDisplayName: 'Away ' + i }, score: 99 }], status: { type: { shortDetail: 'Final' } } }] })) };
  if (url.includes('radio-browser')) return fixtureRows(i => ({ stationuuid: String(i), name: 'Station ' + i, url_resolved: 'https://example.invalid/radio', favicon: fixtureImage, country: 'Sample country', bitrate: 128 }));
  if (url.includes('opentdb')) return { results: fixtureRows(() => ({ category: 'General knowledge', difficulty: 'easy', question: 'Which answer is correct?', incorrect_answers: ['Two', 'Three', 'Four'], correct_answer: 'One' }), 10) };
  const longText = 'A deliberately long passage used to verify that changing the size shows a shorter excerpt without losing the full text. '.repeat(15);
  if (url.includes('zenquotes')) return [{ q: longText, a: 'Test author' }];
  if (url.includes('adviceslip')) return { slip: { advice: longText, id: 12 } };
  if (url.includes('icanhazdadjoke')) return { joke: longText };
  if (url.includes('uselessfacts')) return { text: longText };
  return {};
}
window.fetch = async (url) => new Response(JSON.stringify(fixtureData(String(url))), { status: 200, headers: { 'Content-Type': 'application/json' } });
// Clocks run once at mount; tests do not need background game or alarm timers.
window.setInterval = () => 0;
const realMatchMedia = window.matchMedia.bind(window);
window.matchMedia = q => q.includes('prefers-reduced-motion') ? { matches: true } : realMatchMedia(q);
