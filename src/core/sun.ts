/**
 * Where the sun is — over Elliot.
 *
 * The site opens on night or day according to ELLIOT'S sky, not the
 * visitor's: the field is the place he is standing in, so it is dark when it
 * is dark where he is, and the clock in the corner says what time it is there
 * (`ELLIOT_ZONE`, and `elliotPlace()` for the sun). A Londoner visiting at
 * 4:30pm in December gets late morning in New York, and the corner says so.
 * It used to follow the visitor's own zone, and that read as a screensaver
 * rather than a place: there was nothing to learn from it.
 *
 * `guessPlace` is still here for the visitor's side — it places a person
 * from the IANA zone their browser reports, which needs nothing the browser
 * asks permission for: the instant (`Date.now()`, UTC underneath) and the
 * zone name.
 *
 * The zone is a coarser fix than GPS, and that is the point. Sunset moves
 * about a minute per fifty miles of latitude, so a city in the right country
 * is within a few minutes of the truth, and a geolocation prompt on a
 * personal site is a worse first impression than being ten minutes early on
 * a sunset. Zones we do not know are placed from their region and their UTC
 * offset, which still gets the season right.
 *
 * `sunElevation` is the NOAA low-precision algorithm (good to a fraction of a
 * degree for this century), and "day" is the sun above civil dusk: a few
 * degrees under the horizon, when it is still light enough to read outside.
 */

import type { TimeOfDay } from '../world/field'

/** degrees below the horizon at which the field goes to night */
const DUSK_ELEVATION = -4

/** [latitude, longitude] of a city in each zone, degrees; enough to place the sun */
const ZONES: Record<string, [number, number]> = {
  'Africa/Cairo': [30.0, 31.2],
  'Africa/Casablanca': [33.6, -7.6],
  'Africa/Johannesburg': [-26.2, 28.0],
  'Africa/Lagos': [6.5, 3.4],
  'Africa/Nairobi': [-1.3, 36.8],
  'America/Anchorage': [61.2, -149.9],
  'America/Argentina/Buenos_Aires': [-34.6, -58.4],
  'America/Bogota': [4.7, -74.1],
  'America/Boise': [43.6, -116.2],
  'America/Chicago': [41.9, -87.6],
  'America/Denver': [39.7, -105.0],
  'America/Detroit': [42.3, -83.0],
  'America/Edmonton': [53.5, -113.5],
  'America/Halifax': [44.6, -63.6],
  'America/Indiana/Indianapolis': [39.8, -86.2],
  'America/Lima': [-12.0, -77.0],
  'America/Los_Angeles': [34.1, -118.2],
  'America/Mexico_City': [19.4, -99.1],
  'America/Montreal': [45.5, -73.6],
  'America/New_York': [40.7, -74.0],
  'America/Phoenix': [33.4, -112.1],
  'America/Regina': [50.4, -104.6],
  'America/Santiago': [-33.4, -70.6],
  'America/Sao_Paulo': [-23.5, -46.6],
  'America/St_Johns': [47.6, -52.7],
  'America/Toronto': [43.7, -79.4],
  'America/Vancouver': [49.3, -123.1],
  'America/Winnipeg': [49.9, -97.1],
  'Asia/Bangkok': [13.8, 100.5],
  'Asia/Dhaka': [23.8, 90.4],
  'Asia/Dubai': [25.2, 55.3],
  'Asia/Ho_Chi_Minh': [10.8, 106.7],
  'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Jakarta': [-6.2, 106.8],
  'Asia/Jerusalem': [31.8, 35.2],
  'Asia/Karachi': [24.9, 67.0],
  'Asia/Kolkata': [19.1, 72.9],
  'Asia/Kuala_Lumpur': [3.1, 101.7],
  'Asia/Manila': [14.6, 121.0],
  'Asia/Riyadh': [24.7, 46.7],
  'Asia/Seoul': [37.6, 127.0],
  'Asia/Shanghai': [31.2, 121.5],
  'Asia/Singapore': [1.3, 103.8],
  'Asia/Taipei': [25.0, 121.6],
  'Asia/Tehran': [35.7, 51.4],
  'Asia/Tokyo': [35.7, 139.7],
  'Atlantic/Reykjavik': [64.1, -21.9],
  'Australia/Adelaide': [-34.9, 138.6],
  'Australia/Brisbane': [-27.5, 153.0],
  'Australia/Melbourne': [-37.8, 145.0],
  'Australia/Perth': [-32.0, 115.9],
  'Australia/Sydney': [-33.9, 151.2],
  'Europe/Amsterdam': [52.4, 4.9],
  'Europe/Athens': [38.0, 23.7],
  'Europe/Berlin': [52.5, 13.4],
  'Europe/Brussels': [50.8, 4.4],
  'Europe/Copenhagen': [55.7, 12.6],
  'Europe/Dublin': [53.3, -6.3],
  'Europe/Helsinki': [60.2, 24.9],
  'Europe/Istanbul': [41.0, 29.0],
  'Europe/Kyiv': [50.5, 30.5],
  'Europe/Lisbon': [38.7, -9.1],
  'Europe/London': [51.5, -0.1],
  'Europe/Madrid': [40.4, -3.7],
  'Europe/Moscow': [55.8, 37.6],
  'Europe/Oslo': [59.9, 10.8],
  'Europe/Paris': [48.9, 2.4],
  'Europe/Prague': [50.1, 14.4],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Stockholm': [59.3, 18.1],
  'Europe/Vienna': [48.2, 16.4],
  'Europe/Warsaw': [52.2, 21.0],
  'Europe/Zurich': [47.4, 8.5],
  'Pacific/Auckland': [-36.8, 174.8],
  'Pacific/Honolulu': [21.3, -157.9],
}

/** a middling latitude for each region, for zones the table does not name */
const REGION_LATITUDE: Record<string, number> = {
  Africa: 5,
  America: 38,
  Antarctica: -70,
  Asia: 30,
  Atlantic: 35,
  Australia: -30,
  Europe: 50,
  Indian: -15,
  Pacific: -15,
}

export interface Place {
  lat: number
  lon: number
}

/** the zone Elliot lives in; the server keeps the same default in server/live.ts */
export const ELLIOT_ZONE = 'America/New_York'

/** where Elliot is, for the sun */
export function elliotPlace(): Place {
  const [lat, lon] = ZONES[ELLIOT_ZONE]!
  return { lat, lon }
}

/** "11:16 PM EDT" — the wall clock where Elliot is, right now */
export function elliotClock(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ELLIOT_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(now)
}

/** the visitor's rough place on the globe, from the zone their browser reports */
export function guessPlace(now: Date = new Date()): Place {
  let zone = ''
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    /* an old engine: fall through to the offset */
  }
  const known = ZONES[zone]
  if (known) return { lat: known[0], lon: known[1] }

  // Longitude follows the clock: one hour of offset per fifteen degrees.
  // Daylight saving shifts this by an hour in summer, which is a mile or two
  // of sunset either way — nothing beside the latitude guess.
  const lon = Math.max(-180, Math.min(180, -now.getTimezoneOffset() / 4))
  const region = zone.split('/')[0]
  return { lat: REGION_LATITUDE[region] ?? 40, lon }
}

/** sun elevation above the horizon in degrees at `place`, at the instant `now` */
export function sunElevation(place: Place, now: Date = new Date()): number {
  const rad = Math.PI / 180
  // days since J2000.0 (noon UTC on 1 Jan 2000)
  const d = now.getTime() / 86_400_000 - 10957.5

  const meanLon = (280.46 + 0.9856474 * d) % 360
  const meanAnom = (357.528 + 0.9856003 * d) * rad
  const eclLon =
    (meanLon + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * rad
  const obliquity = (23.439 - 0.0000004 * d) * rad

  const decl = Math.asin(Math.sin(obliquity) * Math.sin(eclLon))
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(eclLon), Math.cos(eclLon))

  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24
  const localSiderealDeg = gmstHours * 15 + place.lon
  const hourAngle = localSiderealDeg * rad - ra

  const lat = place.lat * rad
  const sinElev =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinElev))) / rad
}

/** night or day for this visitor, right now */
export function timeOfDayFor(place: Place = guessPlace(), now: Date = new Date()): TimeOfDay {
  return sunElevation(place, now) > DUSK_ELEVATION ? 'day' : 'night'
}
