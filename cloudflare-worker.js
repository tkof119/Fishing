/*
  한량낚시 기상청 API 프록시 - Cloudflare Worker

  사용 방법:
  1. Cloudflare Workers에 새 Worker를 만듭니다.
  2. 이 파일 내용을 붙여넣습니다.
  3. 아래 KMA_SERVICE_KEY에 공공데이터포털 "Decoding" 인증키를 넣습니다.
  4. 배포 후 발급된 Worker 주소를 index.html의 CONFIG.kmaWorkerUrl에 넣습니다.

  이 Worker는 2가지를 함께 호출합니다.
  - getUltraSrtNcst: 현재 실황
  - getUltraSrtFcst: 1시간 단위 초단기예보
*/

const KMA_SERVICE_KEY = "e82855ddaed38994ec7f9cb40de64473ec59331ee5b4bcb3cf4bc9b68e0339ca";

const KMA_BASE =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname !== "/weather") {
      return json({
        ok: true,
        message: "한량낚시 KMA Worker",
        usage: "/weather?lat=37.55&lon=128.35"
      });
    }

    try {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json({ ok:false, message:"lat/lon 파라미터가 필요합니다." }, 400);
      }

      if (!KMA_SERVICE_KEY || KMA_SERVICE_KEY.includes("여기에_본인")) {
        return json({ ok:false, message:"Worker에 KMA_SERVICE_KEY를 입력하세요." }, 500);
      }

      const grid = dfsXyConv(lat, lon);
      const base = getKmaBaseDateTime();

      const [ncstResult, fcstResult] = await Promise.allSettled([
        callKma("getUltraSrtNcst", base.baseDate, base.baseTime, grid),
        callKma("getUltraSrtFcst", base.baseDate, base.baseTime, grid)
      ]);

      let currentItems = [];
      let forecastItems = [];
      let currentError = null;
      let forecastError = null;

      if (ncstResult.status === "fulfilled") currentItems = ncstResult.value;
      else currentError = ncstResult.reason?.message || String(ncstResult.reason);

      if (fcstResult.status === "fulfilled") forecastItems = fcstResult.value;
      else forecastError = fcstResult.reason?.message || String(fcstResult.reason);

      if (!currentItems.length && !forecastItems.length) {
        return json({
          ok:false,
          message:"기상청 현재/예보 자료를 모두 가져오지 못했습니다.",
          currentError,
          forecastError,
          baseDate:base.baseDate,
          baseTime:base.baseTime,
          nx:grid.nx,
          ny:grid.ny
        }, 502);
      }

      const current = parseCurrentItems(currentItems);
      const hourly = parseForecastItems(forecastItems);

      return json({
        ok:true,
        source:"KMA getUltraSrtNcst + getUltraSrtFcst",
        baseDate:base.baseDate,
        baseTime:base.baseTime,
        baseTimeLabel:`${base.baseTime.slice(0,2)}:${base.baseTime.slice(2,4)}`,
        nx:grid.nx,
        ny:grid.ny,
        lat,
        lon,
        hasHourlyForecast:hourly.length > 0,
        hourly,
        ...current
      });
    } catch (err) {
      return json({ ok:false, message:err.message || String(err) }, 500);
    }
  }
};

async function callKma(endpoint, baseDate, baseTime, grid) {
  const apiUrl = new URL(`${KMA_BASE}/${endpoint}`);
  apiUrl.searchParams.set("serviceKey", KMA_SERVICE_KEY);
  apiUrl.searchParams.set("pageNo", "1");
  apiUrl.searchParams.set("numOfRows", "1000");
  apiUrl.searchParams.set("dataType", "JSON");
  apiUrl.searchParams.set("base_date", baseDate);
  apiUrl.searchParams.set("base_time", baseTime);
  apiUrl.searchParams.set("nx", String(grid.nx));
  apiUrl.searchParams.set("ny", String(grid.ny));

  const res = await fetch(apiUrl.toString());
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint}: 기상청 응답 JSON 해석 실패`);
  }

  const header = data?.response?.header;
  if (!header || header.resultCode !== "00") {
    throw new Error(`${endpoint}: ${header?.resultMsg || "NO_DATA"} (${header?.resultCode || "unknown"})`);
  }

  return data?.response?.body?.items?.item || [];
}

function json(obj, status = 200) {
  return withCors(new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  }));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(response.body, { status: response.status, headers });
}

function parseCurrentItems(items) {
  const map = {};
  for (const item of items) map[item.category] = item.obsrValue;

  return {
    temperature: num(map.T1H),
    rain1h: parseRain(map.RN1),
    humidity: num(map.REH),
    rainType: map.PTY ?? null,
    windDirection: num(map.VEC),
    windSpeed: num(map.WSD)
  };
}

function parseForecastItems(items) {
  const byTime = {};

  for (const item of items) {
    const time = item.fcstTime;
    if (!time) continue;

    if (!byTime[time]) {
      byTime[time] = { time };
    }

    if (item.category === "T1H") byTime[time].temperature = num(item.fcstValue);
    if (item.category === "RN1") byTime[time].rain1h = parseRain(item.fcstValue);
    if (item.category === "WSD") byTime[time].windSpeed = num(item.fcstValue);
    if (item.category === "VEC") byTime[time].windDirection = num(item.fcstValue);
    if (item.category === "PTY") byTime[time].rainType = item.fcstValue;
    if (item.category === "REH") byTime[time].humidity = num(item.fcstValue);
  }

  return Object.values(byTime).sort((a, b) => a.time.localeCompare(b.time));
}

function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseRain(v) {
  if (v === undefined || v === null || v === "") return 0;
  const s = String(v).trim();

  if (s === "강수없음") return 0;
  if (s.includes("1mm 미만")) return 0.5;

  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/*
  초단기실황/초단기예보는 최신 정각 자료가 바로 안 나오는 경우가 있습니다.
  NO_DATA 방지를 위해 현재 시각에서 45분 전 기준 정각을 사용합니다.
*/
function getKmaBaseDateTime() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setMinutes(kst.getMinutes() - 45);

  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");

  return {
    baseDate: `${y}${m}${d}`,
    baseTime: `${h}00`
  };
}

/*
  위경도 -> 기상청 Lambert 격자 변환
*/
function dfsXyConv(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
           Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);

  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx:x, ny:y };
}
