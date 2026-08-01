function expandCompactDictionary(rows) {
  const japaneseOnRawByChar = new Map(rows.map((row) => [row[0], row[4] || ""]));
  return rows.map((row) => expandCompactDictionaryRow(row, japaneseOnRawByChar));
}

function expandCompactDictionaryRow(row, japaneseOnRawByChar = compactJapaneseOnRawByChar) {
  const [char, meaning, mandarin, cantonese, japaneseOnRaw, korean, vietnamese] = row;
  const japaneseOnKana = japaneseOnKanaForChar(char, japaneseOnRaw, japaneseOnRawByChar);
  const jp = filterJapaneseReadingsToAllowed(japaneseReadingsForChar(char), japaneseOnKana);
  const mcReadings =
    combineMiddleChineseReadings(
      ...middleChineseReadingCandidates(char).flatMap((candidate) => middleChineseReadingGroups(candidate)),
    );
  const hanViet = typeof HAN_VIET_READINGS !== "undefined" ? HAN_VIET_READINGS[char] : "";
  const displayForms = hanDisplayFormsForChar(char);
  const sino = {
    chineseDisplayChar: displayForms.simplified,
    mandarin,
    cantonese,
    japaneseDisplayChar: displayForms.japanese,
    japaneseGo: jp?.go || { modernKana: "", historicalKana: "" },
    japaneseKan: jp?.kan || { modernKana: "", historicalKana: "" },
    japaneseKanyo: jp?.kanyo || { modernKana: "", historicalKana: "" },
    popularJapaneseOnKana: japaneseOnKana,
    korean: koreanToHangul(korean || ""),
    vietnamese: hanViet || vietnamese,
  };
  const readings = mcReadings?.length
    ? mcReadings.map((mc, index) => {
        const emc = enhanceEarlyMiddleChinese(mc);
        return {
          label: `${char} 중고한어 독음 ${index + 1}`,
          meaning: meaningForReading(char, emc, meaning),
          emc,
          lmc: deriveLateMiddleChinese(emc, sino),
          sino: sinoForReading(char, emc, sino),
          needsReview: true,
          sources: middleChineseSources(mc),
        };
      })
    : [
        {
          label: `${char} 자동 수집 독음`,
          meaning: `${koreanDefinitionSummary(char, meaning)} (중고한어 독음별 의미 분화는 검토 필요)`,
          sino,
          needsReview: true,
          sources: ["Unicode Unihan"],
        },
      ];
  return {
    char,
    meaning: koreanDefinitionSummary(char, meaning),
    needsReview: true,
    readings,
  };
}

function meaningForReading(char, mc, fallbackMeaning) {
  const curated = curatedReadingMapForChar(curatedReadingMeanings, char);
  const key = readingMeaningKey(mc);
  const fanqie = key.split("|")[3] || "";
  if (curated?.[key]) return curated[key];
  if (curated?.[fanqie]) return curated[fanqie];
  return `${koreanDefinitionSummary(char, fallbackMeaning)} (독음별 의미 분화는 검토 필요)`;
}

function koreanDefinitionSummary(char, definition) {
  const hun = koreanHunSummaryForChar(char);
  if (hun) return `${hun} 등의 뜻.`;
  const translated = translateDefinitionToKorean(definition);
  if (translated) return translated;
  return "자동 수집 항목입니다.";
}

function koreanHunSummaryForChar(char) {
  const hunMap = typeof KOREAN_HUN !== "undefined" ? KOREAN_HUN[char] : null;
  if (!hunMap) return "";
  const values = uniqueHunValues(Object.values(hunMap).filter(Boolean));
  return values.slice(0, 6).join(", ");
}

function uniqueHunValues(values, reading = "") {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const cleaned = cleanHunValue(value, reading);
    if (!cleaned) return;
    const key = normalizedHunKey(cleaned);
    if (seen.has(key)) return;
    if (result.some((existing) => hunLooksRedundant(existing, cleaned))) return;
    result.push(cleaned);
    seen.add(key);
  });
  return result;
}

function cleanHunValue(value, reading = "") {
  let text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  splitSearchTokens(reading).forEach((token) => {
    text = text.replace(new RegExp(`\\s+${escapeRegExp(token)}$`), "").trim();
  });
  const parts = text
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) return uniqueHunValues(parts, reading).join(", ");
  return text;
}

function normalizedHunKey(value) {
  let text = String(value || "")
    .replace(/\s+/g, "")
    .replace(/(하다|되다|스럽다|롭다|할|될|울|을|를|다)$/u, "");
  const canonical = [
    [/^즐거|^즐기|^즐$/u, "즐"],
    [/^기쁘|^기뻐/u, "기쁨"],
    [/^두려|^두렵/u, "두려움"],
    [/^부끄러|^부끄럽/u, "부끄러움"],
    [/^아름다|^고우/u, "아름다움"],
    [/^깨끗|^맑/u, "깨끗"],
    [/^굳세|^굳/u, "굳셈"],
    [/^넉넉|^부유/u, "넉넉"],
  ].find(([pattern]) => pattern.test(text));
  if (canonical) text = canonical[1];
  return text;
}

function hunLooksRedundant(a, b) {
  const ak = normalizedHunKey(a);
  const bk = normalizedHunKey(b);
  return ak && bk && (ak === bk || ak.includes(bk) || bk.includes(ak));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateDefinitionToKorean(definition) {
  const text = String(definition || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text || text === "unihan 독음 데이터 기반 자동 수집 항목입니다.") return "";
  const phrases = text
    .split(/[;,]/)
    .map((phrase) => phrase.trim().replace(/^(?:a|an|the|to)\s+/, ""))
    .filter(Boolean);
  const translated = [];
  phrases.forEach((phrase) => {
    const value = translateDefinitionPhrase(phrase);
    if (value) translated.push(value);
  });
  const unique = uniqueValues(translated).slice(0, 8);
  return unique.length ? `${unique.join(", ")}.` : "";
}

function translateDefinitionPhrase(phrase) {
  const rules = [
    [/same as|variant|ancient form|old form|non-classical|corrupted|incorrect|interchangeable/, ""],
    [/right|proper|correct|upright|straight/, "바르다"],
    [/government|politic|govern|rule/, "정사, 다스림"],
    [/decide|settle|fix|determine/, "정하다"],
    [/feeling|sentiment|emotion|affection/, "마음, 정"],
    [/essence|semen|spirit|refined/, "정수, 정교함"],
    [/quiet|still|motionless|calm|peaceful/, "고요하다, 평안하다"],
    [/well|mine shaft|pit/, "우물, 구덩이"],
    [/lantern|lamp|light/, "등불"],
    [/sediment|dregs|precipitate|lees/, "찌꺼기, 앙금"],
    [/male adult|robust/, "장정"],
    [/pavilion|kiosk/, "정자"],
    [/stop|suspend|delay|halt/, "멈추다, 머무르다"],
    [/spy|reconnoiter|detective/, "염탐하다"],
    [/submit|show|appear|petition/, "드러내다, 바치다"],
    [/picture|image|figure|resemble|appearance|shape|form/, "형상, 모양"],
    [/court|courtyard|yard/, "뜰, 조정"],
    [/orderly|neat|tidy|whole/, "가지런하다"],
    [/banner|flag/, "기, 깃발"],
    [/crystal|clear|bright|radiant/, "맑고 밝다"],
    [/bridge|beam/, "다리, 들보"],
    [/skillful|ingenious|clever|skill|ability|talent/, "재주, 공교함"],
    [/suburb|open space|waste land/, "교외, 들"],
    [/compare|comparatively/, "견주다, 비교하다"],
    [/sojourn|lodge/, "객지에 머물다"],
    [/bite|gnaw|chew/, "물다, 씹다"],
    [/tall|lofty|high/, "높다"],
    [/beautiful|handsome|pretty|attractive|graceful|seductive|tender/, "아름답다, 곱다"],
    [/disturb|agitate|stir/, "어지럽히다"],
    [/cunning|deceitful|treacherous/, "교활하다"],
    [/white|brilliant/, "희다, 밝다"],
    [/rectify|straighten/, "바로잡다"],
    [/twist|wring|intertwine/, "비틀다, 얽다"],
    [/turn up|lift|elevate|raise/, "들다, 올리다"],
    [/glue|gum|resin|rubber/, "아교, 고무"],
    [/buckwheat/, "메밀"],
    [/dragon/, "용, 교룡"],
    [/sedan|palanquin/, "가마"],
    [/dumpling/, "만두"],
    [/horse|post horse/, "말"],
    [/shark/, "상어"],
    [/flee|escape|break loose/, "달아나다"],
    [/indulge/, "방종하다"],
    [/row|file/, "줄, 행렬"],
    [/number one|\bone\b/, "하나"],
    [/overflow|brim|full/, "넘치다, 가득하다"],
    [/surpass|excel/, "뛰어나다, 앞지르다"],
    [/proof|evidence|testify|verify/, "증거, 증명하다"],
    [/summon|recruit/, "부르다, 모집하다"],
    [/clean|pure|cleanse/, "깨끗하다"],
    [/river|stream|water/, "물, 강"],
    [/pool|pond/, "못"],
    [/jade/, "옥"],
    [/eyeball|pupil/, "눈동자"],
    [/anchor/, "닻"],
    [/lucky|auspicious|fortunate|omen/, "상서롭다, 길하다"],
    [/journey|trip|schedule|agenda/, "길, 일정"],
    [/hole|pitfall|trap|snare/, "구멍, 함정"],
    [/silk/, "비단"],
    [/boat|ship|vessel|dugout|punt/, "배"],
    [/agreement|arrange/, "약속, 정하다"],
    [/virtuous|chaste|loyal/, "곧고 정절 있다"],
    [/state|province|country|nation|kingdom/, "나라, 고을"],
    [/drunk|intoxicated|hangover/, "술취하다"],
    [/nail|spike/, "못"],
    [/gong/, "징"],
    [/ingot|bar of metal/, "쇳덩이"],
    [/spindle|tablet|slab|cake/, "덩이, 패"],
    [/thunder/, "우레"],
    [/pacify|appease/, "평정하다, 달래다"],
    [/top|peak|summit/, "꼭대기"],
    [/large|big|great|vast|grand/, "크다"],
    [/small|little|tiny/, "작다"],
    [/old|former|past|ancient|classic/, "옛, 오래된"],
    [/new|fresh/, "새롭다"],
    [/good|excellent|fine/, "좋다"],
    [/bad|evil|wicked|wrong/, "나쁘다, 악하다"],
    [/black|dark/, "검다"],
    [/red|scarlet/, "붉다"],
    [/blue|green/, "푸르다"],
    [/yellow/, "누렇다"],
    [/round|circle/, "둥글다"],
    [/square/, "모나다"],
    [/long/, "길다"],
    [/short/, "짧다"],
    [/wide|broad/, "넓다"],
    [/narrow/, "좁다"],
    [/deep/, "깊다"],
    [/shallow/, "얕다"],
    [/heavy/, "무겁다"],
    [/light/, "가볍다"],
    [/strong|firm|solid|hard|sturdy/, "굳세다, 단단하다"],
    [/weak|timid/, "약하다"],
    [/fast|quick|rapid/, "빠르다"],
    [/slow/, "느리다"],
    [/low/, "낮다"],
    [/hot|warm/, "덥다, 따뜻하다"],
    [/cold/, "차다"],
    [/dry/, "마르다"],
    [/wet|moist|damp/, "젖다, 축축하다"],
    [/sweet/, "달다"],
    [/bitter/, "쓰다"],
    [/sour/, "시다"],
    [/salty/, "짜다"],
    [/fragrant|scent/, "향기롭다"],
    [/sound|voice|noise/, "소리"],
    [/name|surname/, "이름, 성씨"],
    [/word|speech|speak|say|tell/, "말하다, 말"],
    [/write|writing|letter|script|record/, "글, 기록하다"],
    [/read/, "읽다"],
    [/book|volume|chapter|section|composition/, "책, 글"],
    [/law|rule|regulation|commandment/, "법, 규칙"],
    [/ritual|ceremony|rite/, "예식, 의례"],
    [/music|pleasure|joy|delight/, "음악, 즐거움"],
    [/song|sing/, "노래하다"],
    [/dance/, "춤추다"],
    [/food|eat|meal/, "먹다, 음식"],
    [/drink|wine|liquor/, "마시다, 술"],
    [/clothes|garment|robe|skirt|shirt|jacket/, "옷"],
    [/hat|cap/, "갓, 모자"],
    [/house|home|room|building|hall|temple|palace/, "집, 건물"],
    [/city|town|village|market/, "고을, 시장"],
    [/road|path|way|street/, "길"],
    [/gate|door/, "문"],
    [/wall/, "담, 벽"],
    [/mountain|hill/, "산"],
    [/valley/, "골짜기"],
    [/sea|ocean/, "바다"],
    [/lake/, "호수"],
    [/island/, "섬"],
    [/cloud/, "구름"],
    [/rain/, "비"],
    [/snow/, "눈"],
    [/wind/, "바람"],
    [/star/, "별"],
    [/flower/, "꽃"],
    [/grass|herb/, "풀"],
    [/leaf/, "잎"],
    [/root/, "뿌리"],
    [/fruit/, "열매"],
    [/grain|rice|millet|wheat/, "곡식"],
    [/bamboo/, "대나무"],
    [/willow/, "버들"],
    [/pine/, "소나무"],
    [/bird/, "새"],
    [/fish/, "물고기"],
    [/dog/, "개"],
    [/cow|ox|cattle/, "소"],
    [/sheep|goat/, "양"],
    [/pig|boar/, "돼지"],
    [/deer/, "사슴"],
    [/tiger/, "범"],
    [/insect|worm/, "벌레"],
    [/shell|clam/, "조개"],
    [/body/, "몸"],
    [/head/, "머리"],
    [/face/, "얼굴"],
    [/eye/, "눈"],
    [/ear/, "귀"],
    [/mouth/, "입"],
    [/nose/, "코"],
    [/tooth|teeth/, "이"],
    [/hand/, "손"],
    [/foot|feet/, "발"],
    [/hair/, "머리털"],
    [/bone/, "뼈"],
    [/blood/, "피"],
    [/flesh|meat/, "고기"],
    [/father/, "아버지"],
    [/mother/, "어머니"],
    [/brother/, "형제"],
    [/son/, "아들"],
    [/daughter/, "딸"],
    [/wife/, "아내"],
    [/friend/, "벗"],
    [/servant|slave/, "종"],
    [/teacher|master|tutor/, "스승"],
    [/student|scholar/, "선비, 학생"],
    [/army|military|soldier|troop/, "군사"],
    [/king|ruler|lord|prince|emperor/, "임금"],
    [/official|office|bureaucrat/, "벼슬, 관청"],
    [/people|person|man|human/, "사람"],
    [/woman|female/, "여자"],
    [/child|boy|girl/, "아이"],
    [/heart|mind|thought|think|consider/, "마음, 생각"],
    [/love/, "사랑하다"],
    [/anger|rage/, "성내다"],
    [/fear|dread/, "두려워하다"],
    [/sad|sorrow/, "슬프다"],
    [/laugh|smile/, "웃다"],
    [/cry|weep/, "울다"],
    [/know|understand/, "알다"],
    [/remember/, "기억하다"],
    [/forget/, "잊다"],
    [/ask|question/, "묻다"],
    [/answer|reply/, "대답하다"],
    [/teach|instruct/, "가르치다"],
    [/learn|study/, "배우다"],
    [/make|do|work|act/, "하다, 만들다"],
    [/use|employ/, "쓰다"],
    [/take|hold|grasp|seize/, "잡다"],
    [/give|grant|bestow/, "주다"],
    [/receive|accept/, "받다"],
    [/send|dispatch/, "보내다"],
    [/come|arrive/, "오다"],
    [/go|leave/, "가다"],
    [/return|again/, "돌아오다, 다시"],
    [/enter/, "들어가다"],
    [/exit|go out/, "나가다"],
    [/open/, "열다"],
    [/close|shut/, "닫다"],
    [/rise|stand up/, "일어나다"],
    [/fall|drop/, "떨어지다"],
    [/move|walk|travel/, "움직이다, 다니다"],
    [/run/, "달리다"],
    [/fly/, "날다"],
    [/sit/, "앉다"],
    [/stand/, "서다"],
    [/sleep/, "자다"],
    [/rest/, "쉬다"],
    [/hide|conceal/, "숨기다"],
    [/cover/, "덮다"],
    [/cut|chop|slice/, "자르다"],
    [/break|destroy|smash/, "깨뜨리다"],
    [/kill|slaughter/, "죽이다"],
    [/save|rescue/, "구하다"],
    [/help|assist|aid/, "돕다"],
    [/protect|guard|defend/, "지키다"],
    [/attack|strike|hit|beat/, "치다, 공격하다"],
    [/fight|battle|war/, "싸우다"],
    [/follow|obey/, "따르다"],
    [/lead|guide/, "이끌다"],
    [/join|connect|attach/, "잇다, 붙이다"],
    [/divide|separate|part/, "나누다"],
    [/gather|collect|assemble/, "모으다"],
    [/scatter|spread/, "흩다, 펼치다"],
    [/choose|select|pick/, "고르다"],
    [/change|exchange|transform/, "바꾸다"],
    [/measure|weigh|count|number/, "헤아리다, 세다"],
    [/buy/, "사다"],
    [/sell/, "팔다"],
    [/price|value|wealth|property|treasure/, "재물, 값"],
    [/money|coin/, "돈"],
    [/cart|vehicle|carriage|chariot/, "수레"],
    [/weapon|sword|knife|bow|arrow|spear/, "무기"],
    [/medicine|drug/, "약"],
    [/disease|illness|sick/, "병"],
  ];
  const found = rules.find(([pattern]) => pattern.test(phrase));
  return found ? found[1] : "";
}

function sinoForReading(char, mc, sino) {
  const key = readingMeaningKey(mc);
  const override = curatedReadingMapForChar(curatedReadingSino, char)?.[key];
  const vietnameseOverride = curatedReadingMapForChar(curatedVietnameseReadings, char)?.[key];
  return override || vietnameseOverride ? { ...sino, ...override, ...vietnameseOverride } : sino;
}

function curatedReadingMapForChar(source, char) {
  for (const candidate of hanTraditionalSearchCandidates(char)) {
    if (source[candidate]) return source[candidate];
  }
  return null;
}

function readingMeaningKey(mc) {
  const fanqie = normalizeMeaningKeyText(mc.fanqie).replace(/-重鈕$/, "");
  return [mc.initial, mc.final, mc.tone, fanqie].join("|");
}

function normalizeMeaningKeyText(value) {
  return String(value || "")
    .replace(/戸/g, "戶")
    .replace(/敎/g, "教")
    .replace(/吕/g, "呂")
    .replace(/卧/g, "臥");
}

const curatedReadingSino = {
  樂: {
    "疑母|肴韻|去聲|五教": { korean: "요" },
    "疑母|覺韻|入聲|五角": { korean: "악" },
    "來母|鐸韻|入聲|盧各": { korean: "락" },
  },
  行: {
    "匣母|唐韻|平聲|胡郎": { korean: "항" },
    "匣母|庚韻|平聲|戶庚": { korean: "행" },
    "匣母|唐韻|去聲|下浪": { korean: "항" },
    "匣母|庚韻|去聲|下更": { korean: "행" },
  },
  數: {
    "生母|虞韻|上聲|所矩": { korean: "수" },
    "生母|虞韻|去聲|色句": { korean: "수" },
    "生母|覺韻|入聲|所角": { korean: "삭" },
  },
  惡: {
    "影母|模韻|平聲|哀都": { korean: "오" },
    "影母|模韻|去聲|烏路": { korean: "오" },
    "影母|鐸韻|入聲|烏各": { korean: "악" },
  },
  說: {
    "書母|祭韻|去聲|舒芮": { korean: "세" },
    "以母|薛韻|入聲|弋雪": { korean: "열" },
    "書母|薛韻|入聲|失爇": { korean: "설" },
  },
  便: {
    "並母|仙韻|平聲|房連": { korean: "편" },
    "並母|仙韻|去聲|婢面": { korean: "변" },
  },
  著: {
    "澄母|魚韻|平聲|直魚": { korean: "저" },
    "知母|魚韻|上聲|丁呂": { korean: "저" },
    "知母|魚韻|去聲|陟慮": { korean: "저" },
    "知母|藥韻|入聲|張略": { korean: "착" },
    "澄母|藥韻|入聲|直略": { korean: "착" },
  },
  度: {
    "定母|模韻|去聲|徒故": { korean: "도" },
    "定母|鐸韻|入聲|徒落": { korean: "탁" },
  },
  更: {
    "見母|庚韻|平聲|古行": { korean: "경" },
    "見母|庚韻|去聲|古孟": { korean: "갱" },
  },
  參: {
    "生母|侵韻|平聲|所今": { korean: "참" },
    "初母|侵韻|平聲|楚簪": { korean: "참" },
    "清母|覃韻|平聲|倉含": { korean: "참" },
    "心母|談韻|平聲|蘇甘": { korean: "삼" },
    "清母|覃韻|去聲|七紺": { korean: "참" },
  },
  暴: {
    "並母|豪韻|去聲|薄報": { korean: "포" },
    "並母|屋韻|入聲|蒲木": { korean: "폭" },
  },
  切: {
    "清母|齊韻|去聲|七計": { korean: "체" },
    "清母|屑韻|入聲|千結": { korean: "절" },
  },
  宿: {
    "心母|尤韻|去聲|息救": { korean: "수" },
    "心母|屋韻|入聲|息逐": { korean: "숙" },
  },
  食: {
    "以母|之韻|去聲|羊吏": { korean: "이" },
    "船母|職韻|入聲|乘力": { korean: "식" },
  },
  率: {
    "生母|脂韻|去聲|所類": { korean: "솔" },
    "生母|質韻|入聲|所律": { korean: "률" },
    "生母|術韻|入聲|所律": { korean: "률" },
  },
  句: {
    "群母|虞韻|平聲|其俱": { korean: "귀" },
    "羣母|虞韻|平聲|其俱": { korean: "귀" },
    "見母|侯韻|平聲|古侯": { korean: "구" },
    "見母|虞韻|去聲|九遇": { korean: "구" },
    "見母|侯韻|去聲|古候": { korean: "구" },
  },
  畜: {
    "徹母|尤韻|去聲|丑救": { korean: "축" },
    "曉母|尤韻|去聲|許救": { korean: "축" },
    "曉母|屋韻|入聲|許竹": { korean: "휵" },
    "徹母|屋韻|入聲|丑六": { korean: "휵" },
  },
  傳: {
    "澄母|仙韻|平聲|直攣": { korean: "전" },
    "澄母|仙韻|去聲|直戀": { korean: "전" },
    "知母|仙韻|去聲|知戀": { korean: "전" },
  },
  省: {
    "生母|庚韻|上聲|所景": { korean: "생" },
    "心母|清韻|上聲|息井": { korean: "성" },
  },
  塞: {
    "心母|咍韻|去聲|先代": { korean: "새" },
    "心母|德韻|入聲|蘇則": { korean: "색" },
  },
  沈: {
    "澄母|侵韻|平聲|直深": { korean: "침" },
    "澄母|侵韻|去聲|直禁": { korean: "침" },
    "書母|侵韻|上聲|式任": { korean: "심" },
    "書母|侵韻|上聲|式荏": { korean: "심" },
    "昌母|侵韻|上聲|昌枕": { korean: "침" },
  },
  單: {
    "端母|寒韻|平聲|都寒": { korean: "단" },
    "常母|仙韻|平聲|市連": { korean: "선" },
    "常母|仙韻|上聲|常演": { korean: "선" },
    "常母|仙韻|去聲|時戰": { korean: "선" },
  },
  契: {
    "溪母|齊韻|去聲|苦計": { korean: "계" },
    "溪母|屑韻|入聲|苦結": { korean: "결" },
    "溪母|迄韻|入聲|去迄": { korean: "글" },
    "溪母|殷韻|入聲|去訖": { korean: "글" },
  },
  塡: {
    "知母|眞韻|平聲|陟鄰": { korean: "진" },
    "知母|真韻|平聲|陟鄰": { korean: "진" },
    "知母|眞韻|去聲|陟刃": { korean: "진" },
    "知母|真韻|去聲|陟刃": { korean: "진" },
    "定母|先韻|平聲|徒年": { korean: "전" },
    "定母|先韻|去聲|堂練": { korean: "전" },
  },
  咽: {
    "影母|先韻|平聲|烏前": { korean: "인" },
    "影母|先韻|去聲|於甸": { korean: "인" },
    "影母|屑韻|入聲|烏結": { korean: "열" },
  },
  索: {
    "心母|鐸韻|入聲|蘇各": { korean: "삭" },
    "生母|陌韻|入聲|山戟": { korean: "색" },
    "生母|麥韻|入聲|山責": { korean: "색" },
  },
  濟: {
    "精母|齊韻|上聲|子禮": { korean: "제" },
    "精母|齊韻|去聲|子計": { korean: "제" },
  },
  葉: {
    "以母|葉韻|入聲|與涉": { korean: "엽" },
    "書母|葉韻|入聲|書涉": { korean: "섭" },
    "匣母|怗韻|入聲|胡頰": { korean: "협" },
  },
  車: {
    "昌母|麻韻|平聲|尺遮": { korean: "차" },
    "見母|魚韻|平聲|九魚": { korean: "거" },
  },
  射: {
    "船母|麻韻|去聲|神夜": { korean: "사" },
    "以母|麻韻|去聲|羊謝": { korean: "야" },
    "以母|昔韻|入聲|羊益": { korean: "역" },
    "船母|昔韻|入聲|食亦": { korean: "석" },
  },
  識: {
    "書母|職韻|入聲|賞職": { korean: "식" },
    "章母|之韻|去聲|職吏": { korean: "지" },
  },
  復: {
    "並母|屋韻|入聲|房六": { korean: "복" },
    "並母|尤韻|去聲|扶富": { korean: "부" },
  },
  畫: {
    "匣母|佳韻|去聲|胡卦": { korean: "화" },
    "匣母|麥韻|入聲|胡麥": { korean: "획" },
  },
  處: {
    "昌母|魚韻|上聲|昌與": { korean: "처" },
    "昌母|魚韻|去聲|昌據": { korean: "처" },
  },
  號: {
    "匣母|豪韻|平聲|胡刀": { korean: "호" },
    "匣母|豪韻|去聲|胡倒": { korean: "호" },
    "匣母|豪韻|去聲|胡到": { korean: "호" },
  },
  寧: {
    "泥母|青韻|平聲|奴丁": { korean: "녕" },
    "澄母|魚韻|平聲|直魚": { korean: "저" },
    "澄母|魚韻|上聲|直呂": { korean: "저" },
  },
};

const curatedVietnameseReadings = {
  樂: {
    "疑母|肴韻|去聲|五教": { vietnamese: "nhạo" },
    "疑母|覺韻|入聲|五角": { vietnamese: "nhạc" },
    "來母|鐸韻|入聲|盧各": { vietnamese: "lạc" },
  },
  行: {
    "匣母|唐韻|平聲|胡郎": { vietnamese: "hàng" },
    "匣母|庚韻|平聲|戶庚": { vietnamese: "hành" },
    "匣母|唐韻|去聲|下浪": { vietnamese: "hạng" },
    "匣母|庚韻|去聲|下更": { vietnamese: "hạnh" },
  },
  長: {
    "澄母|陽韻|平聲|直良": { vietnamese: "trường" },
    "知母|陽韻|上聲|知丈": { vietnamese: "trưởng" },
    "澄母|陽韻|去聲|直亮": { vietnamese: "trướng" },
  },
  重: {
    "澄母|鍾韻|平聲|直容": { vietnamese: "trùng" },
    "澄母|鍾韻|上聲|直隴": { vietnamese: "trọng" },
    "澄母|鍾韻|去聲|柱用": { vietnamese: "trọng" },
  },
  中: {
    "知母|東韻|平聲|陟弓": { vietnamese: "trung" },
    "知母|東韻|去聲|陟仲": { vietnamese: "trúng" },
  },
  傳: {
    "澄母|仙韻|平聲|直攣": { vietnamese: "truyền" },
    "澄母|仙韻|去聲|直戀": { vietnamese: "truyện" },
    "知母|仙韻|去聲|知戀": { vietnamese: "trạm" },
  },
  數: {
    "生母|虞韻|上聲|所矩": { vietnamese: "số" },
    "生母|虞韻|去聲|色句": { vietnamese: "số" },
    "生母|覺韻|入聲|所角": { vietnamese: "sác" },
  },
  惡: {
    "影母|模韻|平聲|哀都": { vietnamese: "ô" },
    "影母|模韻|去聲|烏路": { vietnamese: "ố" },
    "影母|鐸韻|入聲|烏各": { vietnamese: "ác" },
  },
  解: {
    "匣母|佳韻|上聲|胡買": { vietnamese: "giải" },
    "見母|佳韻|上聲|佳買": { vietnamese: "giải" },
    "見母|佳韻|去聲|古隘": { vietnamese: "giới" },
    "匣母|佳韻|去聲|胡懈": { vietnamese: "giải" },
  },
  降: {
    "匣母|江韻|平聲|下江": { vietnamese: "hàng" },
    "見母|江韻|去聲|古巷": { vietnamese: "giáng" },
  },
  易: {
    "以母|支韻|去聲|以豉": { vietnamese: "dị" },
    "以母|昔韻|入聲|羊益": { vietnamese: "dịch" },
  },
  好: {
    "曉母|豪韻|上聲|呼晧": { vietnamese: "hảo" },
    "曉母|豪韻|去聲|呼到": { vietnamese: "hiếu" },
  },
  當: {
    "端母|唐韻|平聲|都郎": { vietnamese: "đương" },
    "端母|唐韻|去聲|丁浪": { vietnamese: "đáng" },
  },
  難: {
    "泥母|寒韻|平聲|那干": { vietnamese: "nan" },
    "泥母|寒韻|去聲|奴案": { vietnamese: "nạn" },
  },
  少: {
    "書母|宵韻|上聲|書沼": { vietnamese: "thiểu" },
    "書母|宵韻|去聲|失照": { vietnamese: "thiếu" },
  },
  上: {
    "常母|陽韻|上聲|時掌": { vietnamese: "thượng" },
    "常母|陽韻|去聲|時亮": { vietnamese: "thượng" },
  },
  將: {
    "精母|陽韻|平聲|即良": { vietnamese: "tương" },
    "精母|陽韻|去聲|子亮": { vietnamese: "tướng" },
  },
  相: {
    "心母|陽韻|平聲|息良": { vietnamese: "tương" },
    "心母|陽韻|去聲|息亮": { vietnamese: "tướng" },
  },
  藏: {
    "從母|唐韻|平聲|昨郎": { vietnamese: "tàng" },
    "從母|唐韻|去聲|徂浪": { vietnamese: "tạng" },
  },
  朝: {
    "知母|宵韻|平聲|陟遙": { vietnamese: "triêu" },
    "澄母|宵韻|平聲|直遙": { vietnamese: "triều" },
  },
  著: {
    "澄母|魚韻|平聲|直魚": { vietnamese: "trữ" },
    "知母|魚韻|上聲|丁呂": { vietnamese: "trữ" },
    "知母|魚韻|去聲|陟慮": { vietnamese: "trứ" },
    "知母|藥韻|入聲|張略": { vietnamese: "trước" },
    "澄母|藥韻|入聲|直略": { vietnamese: "trước" },
  },
  度: {
    "定母|模韻|去聲|徒故": { vietnamese: "độ" },
    "定母|鐸韻|入聲|徒落": { vietnamese: "đạc" },
  },
  量: {
    "來母|陽韻|平聲|呂張": { vietnamese: "lường" },
    "來母|陽韻|平聲|呂章": { vietnamese: "lường" },
    "來母|陽韻|去聲|力讓": { vietnamese: "lượng" },
  },
  過: {
    "見母|歌韻|平聲|古禾": { vietnamese: "qua" },
    "見母|戈韻|平聲|古禾": { vietnamese: "qua" },
    "見母|歌韻|去聲|古臥": { vietnamese: "quá" },
    "見母|戈韻|去聲|古臥": { vietnamese: "quá" },
  },
  應: {
    "影母|蒸韻|平聲|於陵": { vietnamese: "ưng" },
    "影母|蒸韻|去聲|於證": { vietnamese: "ứng" },
  },
  要: {
    "影母|宵韻|平聲|於霄": { vietnamese: "yêu" },
    "影母|宵韻|去聲|於笑": { vietnamese: "yếu" },
  },
  與: {
    "以母|魚韻|平聲|以諸": { vietnamese: "dư" },
    "以母|魚韻|上聲|余呂": { vietnamese: "dữ" },
    "以母|魚韻|去聲|羊洳": { vietnamese: "dự" },
  },
  勝: {
    "書母|蒸韻|平聲|識蒸": { vietnamese: "thăng" },
    "書母|蒸韻|去聲|詩證": { vietnamese: "thắng" },
    "心母|青韻|平聲|桑經": { vietnamese: "thắng" },
  },
  從: {
    "從母|鍾韻|平聲|疾容": { vietnamese: "tòng" },
    "清母|鍾韻|平聲|七恭": { vietnamese: "thung" },
    "從母|鍾韻|去聲|疾用": { vietnamese: "tụng" },
  },
  任: {
    "日母|侵韻|平聲|如林": { vietnamese: "nhâm" },
    "日母|侵韻|去聲|汝鴆": { vietnamese: "nhiệm" },
  },
  更: {
    "見母|庚韻|平聲|古行": { vietnamese: "canh" },
    "見母|庚韻|去聲|古孟": { vietnamese: "cánh" },
  },
  參: {
    "生母|侵韻|平聲|所今": { vietnamese: "sâm" },
    "初母|侵韻|平聲|楚簪": { vietnamese: "xam" },
    "清母|覃韻|平聲|倉含": { vietnamese: "tham" },
    "心母|談韻|平聲|蘇甘": { vietnamese: "tam" },
    "清母|覃韻|去聲|七紺": { vietnamese: "tham" },
  },
  華: {
    "匣母|麻韻|平聲|戶花": { vietnamese: "hoa" },
    "曉母|麻韻|平聲|呼瓜": { vietnamese: "hoa" },
    "匣母|麻韻|去聲|胡化": { vietnamese: "hoá" },
  },
  和: {
    "匣母|戈韻|平聲|戶戈": { vietnamese: "hoà" },
    "匣母|歌韻|平聲|戶戈": { vietnamese: "hoà" },
    "匣母|戈韻|去聲|胡臥": { vietnamese: "hoạ" },
    "匣母|歌韻|去聲|胡臥": { vietnamese: "hoạ" },
  },
  暴: {
    "並母|豪韻|去聲|薄報": { vietnamese: "bạo" },
    "並母|屋韻|入聲|蒲木": { vietnamese: "bộc" },
  },
  切: {
    "清母|齊韻|去聲|七計": { vietnamese: "thế" },
    "清母|屑韻|入聲|千結": { vietnamese: "thiết" },
  },
  空: {
    "溪母|東韻|平聲|苦紅": { vietnamese: "không" },
    "溪母|東韻|去聲|苦貢": { vietnamese: "khống" },
  },
  親: {
    "清母|眞韻|平聲|七人": { vietnamese: "thân" },
    "清母|真韻|平聲|七人": { vietnamese: "thân" },
    "清母|眞韻|去聲|七遴": { vietnamese: "thấn" },
    "清母|真韻|去聲|七遴": { vietnamese: "thấn" },
  },
  奇: {
    "群母|支韻|平聲|渠羈": { vietnamese: "kì" },
    "羣母|支韻|平聲|渠羈": { vietnamese: "kì" },
    "見母|支韻|平聲|居宜": { vietnamese: "cơ" },
  },
  冠: {
    "見母|桓韻|平聲|古丸": { vietnamese: "quan" },
    "見母|寒韻|平聲|古丸": { vietnamese: "quan" },
    "見母|桓韻|去聲|古玩": { vietnamese: "quán" },
    "見母|寒韻|去聲|古玩": { vietnamese: "quán" },
  },
  禁: {
    "見母|侵韻|平聲|居吟": { vietnamese: "câm" },
    "見母|侵韻|去聲|居蔭": { vietnamese: "cấm" },
  },
  邪: {
    "以母|麻韻|平聲|以遮": { vietnamese: "da" },
    "邪母|麻韻|平聲|似嗟": { vietnamese: "tà" },
  },
  宿: {
    "心母|尤韻|去聲|息救": { vietnamese: "tú" },
    "心母|屋韻|入聲|息逐": { vietnamese: "túc" },
  },
  鮮: {
    "心母|仙韻|平聲|相然": { vietnamese: "tiên" },
    "心母|仙韻|上聲|息淺": { vietnamese: "tiển" },
    "心母|仙韻|去聲|私箭": { vietnamese: "tiễn" },
  },
  盛: {
    "常母|清韻|平聲|是征": { vietnamese: "thành" },
    "常母|清韻|去聲|承正": { vietnamese: "thịnh" },
  },
  乘: {
    "船母|蒸韻|平聲|食陵": { vietnamese: "thừa" },
    "船母|蒸韻|去聲|實證": { vietnamese: "thặng" },
  },
  稱: {
    "昌母|蒸韻|平聲|處陵": { vietnamese: "xưng" },
    "昌母|蒸韻|去聲|昌孕": { vietnamese: "xứng" },
  },
  畜: {
    "徹母|尤韻|去聲|丑救": { vietnamese: "súc" },
    "曉母|尤韻|去聲|許救": { vietnamese: "súc" },
    "曉母|屋韻|入聲|許竹": { vietnamese: "húc" },
    "徹母|屋韻|入聲|丑六": { vietnamese: "húc" },
  },
  種: {
    "章母|鍾韻|上聲|之隴": { vietnamese: "chủng" },
    "章母|鍾韻|去聲|之用": { vietnamese: "chúng" },
    "澄母|東韻|平聲|直弓": { vietnamese: "chủng" },
  },
  屬: {
    "章母|燭韻|入聲|之欲": { vietnamese: "chúc" },
    "常母|燭韻|入聲|市玉": { vietnamese: "thuộc" },
  },
  否: {
    "並母|脂韻|上聲|符鄙": { vietnamese: "bĩ" },
    "幫母|尤韻|上聲|方久": { vietnamese: "phủ" },
  },
  食: {
    "以母|之韻|去聲|羊吏": { vietnamese: "tự" },
    "船母|職韻|入聲|乘力": { vietnamese: "thực" },
  },
  率: {
    "生母|脂韻|去聲|所類": { vietnamese: "suất" },
    "生母|術韻|入聲|所律": { vietnamese: "suất" },
    "生母|質韻|入聲|所律": { vietnamese: "suất" },
  },
  卷: {
    "群母|仙韻|平聲|巨員": { vietnamese: "quyền" },
    "羣母|仙韻|平聲|巨員": { vietnamese: "quyền" },
    "群母|元韻|上聲|求晚": { vietnamese: "quyển" },
    "羣母|元韻|上聲|求晚": { vietnamese: "quyển" },
    "見母|仙韻|上聲|居轉": { vietnamese: "quyển" },
    "見母|仙韻|去聲|居倦": { vietnamese: "quyến" },
  },
  句: {
    "群母|虞韻|平聲|其俱": { vietnamese: "câu" },
    "羣母|虞韻|平聲|其俱": { vietnamese: "câu" },
    "見母|侯韻|平聲|古侯": { vietnamese: "câu" },
    "見母|虞韻|去聲|九遇": { vietnamese: "cú" },
    "見母|侯韻|去聲|古候": { vietnamese: "cấu" },
  },
  假: {
    "見母|麻韻|上聲|古疋": { vietnamese: "giả" },
    "見母|麻韻|去聲|古訝": { vietnamese: "giá" },
  },
  沈: {
    "澄母|侵韻|平聲|直深": { vietnamese: "trầm" },
    "澄母|侵韻|去聲|直禁": { vietnamese: "trấm" },
    "書母|侵韻|上聲|式任": { vietnamese: "thẩm" },
    "書母|侵韻|上聲|式荏": { vietnamese: "thẩm" },
    "昌母|侵韻|上聲|昌枕": { vietnamese: "thẩm" },
  },
  令: {
    "來母|仙韻|平聲|力延": { vietnamese: "linh" },
    "來母|清韻|平聲|呂貞": { vietnamese: "linh" },
    "來母|青韻|平聲|郎丁": { vietnamese: "linh" },
    "來母|清韻|去聲|力政": { vietnamese: "lệnh" },
    "來母|青韻|去聲|郎定": { vietnamese: "lệnh" },
  },
  卒: {
    "精母|術韻|入聲|子聿": { vietnamese: "tuất" },
    "精母|質韻|入聲|子聿": { vietnamese: "tuất" },
    "清母|沒韻|入聲|倉没": { vietnamese: "thốt" },
    "清母|沒韻|入聲|倉沒": { vietnamese: "thốt" },
    "精母|沒韻|入聲|臧没": { vietnamese: "tốt" },
    "精母|沒韻|入聲|臧沒": { vietnamese: "tốt" },
  },
  比: {
    "並母|脂韻|平聲|房脂": { vietnamese: "bì" },
    "幫母|脂韻|上聲|卑履": { vietnamese: "tỉ" },
    "並母|脂韻|去聲|毗至": { vietnamese: "tỵ" },
    "幫母|脂韻|去聲|必至": { vietnamese: "bí" },
    "並母|質韻|入聲|毗必": { vietnamese: "bật" },
  },
  戲: {
    "曉母|支韻|平聲|許羈": { vietnamese: "hi" },
    "曉母|模韻|平聲|荒烏": { vietnamese: "hô" },
    "曉母|支韻|去聲|香義": { vietnamese: "hí" },
  },
  斷: {
    "端母|桓韻|上聲|都管": { vietnamese: "đoán" },
    "端母|寒韻|上聲|都管": { vietnamese: "đoán" },
    "定母|桓韻|上聲|徒管": { vietnamese: "đoạn" },
    "定母|寒韻|上聲|徒管": { vietnamese: "đoạn" },
    "端母|桓韻|去聲|丁貫": { vietnamese: "đoán" },
    "端母|寒韻|去聲|丁貫": { vietnamese: "đoán" },
  },
  別: {
    "並母|薛韻|入聲|皮列": { vietnamese: "biệt" },
    "幫母|薛韻|入聲|方别": { vietnamese: "biệt" },
    "幫母|薛韻|入聲|方別": { vietnamese: "biệt" },
    "幫母|祭韻|去聲|必袂": { vietnamese: "biệt" },
  },
  借: {
    "精母|麻韻|去聲|子夜": { vietnamese: "tá" },
    "精母|昔韻|入聲|資昔": { vietnamese: "tịch" },
    "從母|麻韻|去聲|慈夜": { vietnamese: "tạ" },
    "從母|昔韻|入聲|秦昔": { vietnamese: "tịch" },
  },
  單: {
    "端母|寒韻|平聲|都寒": { vietnamese: "đơn" },
    "常母|仙韻|平聲|市連": { vietnamese: "thiền" },
    "常母|仙韻|上聲|常演": { vietnamese: "thiện" },
    "常母|仙韻|去聲|時戰": { vietnamese: "thiện" },
  },
  契: {
    "溪母|齊韻|去聲|苦計": { vietnamese: "khế" },
    "溪母|屑韻|入聲|苦結": { vietnamese: "khiết" },
    "溪母|迄韻|入聲|去迄": { vietnamese: "khất" },
    "溪母|殷韻|入聲|去訖": { vietnamese: "khất" },
  },
  咽: {
    "影母|先韻|平聲|烏前": { vietnamese: "yên" },
    "影母|先韻|去聲|於甸": { vietnamese: "yến" },
    "影母|屑韻|入聲|烏結": { vietnamese: "yết" },
  },
  索: {
    "心母|鐸韻|入聲|蘇各": { vietnamese: "tác" },
    "生母|陌韻|入聲|山戟": { vietnamese: "sách" },
    "生母|麥韻|入聲|山責": { vietnamese: "sách" },
  },
  濟: {
    "精母|齊韻|上聲|子禮": { vietnamese: "tể" },
    "精母|齊韻|去聲|子計": { vietnamese: "tế" },
  },
  號: {
    "匣母|豪韻|平聲|胡刀": { vietnamese: "hào" },
    "匣母|豪韻|去聲|胡倒": { vietnamese: "hiệu" },
    "匣母|豪韻|去聲|胡到": { vietnamese: "hiệu" },
  },
  處: {
    "昌母|魚韻|上聲|昌與": { vietnamese: "xử" },
    "昌母|魚韻|去聲|昌據": { vietnamese: "xứ" },
  },
  寧: {
    "泥母|青韻|平聲|奴丁": { vietnamese: "ninh" },
    "澄母|魚韻|平聲|直魚": { vietnamese: "trữ" },
    "澄母|魚韻|上聲|直呂": { vietnamese: "trữ" },
  },
  葉: {
    "以母|葉韻|入聲|與涉": { vietnamese: "diệp" },
    "書母|葉韻|入聲|書涉": { vietnamese: "diếp" },
    "匣母|怗韻|入聲|胡頰": { vietnamese: "hiệp" },
  },
  舍: {
    "書母|麻韻|上聲|書冶": { vietnamese: "xả" },
    "書母|麻韻|去聲|始夜": { vietnamese: "xá" },
  },
  車: {
    "昌母|麻韻|平聲|尺遮": { vietnamese: "xa" },
    "見母|魚韻|平聲|九魚": { vietnamese: "cư" },
  },
  系: {
    "見母|齊韻|去聲|古詣": { vietnamese: "kế" },
    "匣母|齊韻|去聲|胡計": { vietnamese: "hệ" },
  },
  谷: {
    "見母|屋韻|入聲|古禄": { vietnamese: "cốc" },
    "見母|屋韻|入聲|古祿": { vietnamese: "cốc" },
    "來母|屋韻|入聲|盧谷": { vietnamese: "lộc" },
    "以母|燭韻|入聲|余蜀": { vietnamese: "dục" },
  },
  射: {
    "船母|麻韻|去聲|神夜": { vietnamese: "xạ" },
    "以母|麻韻|去聲|羊謝": { vietnamese: "dạ" },
    "以母|昔韻|入聲|羊益": { vietnamese: "dịch" },
    "船母|昔韻|入聲|食亦": { vietnamese: "thạch" },
  },
  識: {
    "書母|職韻|入聲|賞職": { vietnamese: "thức" },
    "章母|之韻|去聲|職吏": { vietnamese: "chí" },
  },
  論: {
    "來母|真韻|平聲|力迍": { vietnamese: "luân" },
    "來母|諄韻|平聲|力迍": { vietnamese: "luân" },
    "來母|魂韻|平聲|盧昆": { vietnamese: "luân" },
    "來母|魂韻|去聲|盧困": { vietnamese: "luận" },
  },
  畫: {
    "匣母|佳韻|去聲|胡卦": { vietnamese: "hoạ" },
    "匣母|麥韻|入聲|胡麥": { vietnamese: "hoạch" },
  },
  復: {
    "並母|屋韻|入聲|房六": { vietnamese: "phục" },
    "並母|尤韻|去聲|扶富": { vietnamese: "phú" },
  },
  離: {
    "來母|支韻|平聲|呂支": { vietnamese: "li" },
    "來母|支韻|去聲|力智": { vietnamese: "lệ" },
    "來母|齊韻|去聲|郎計": { vietnamese: "lệ" },
    "徹母|支韻|平聲|丑知": { vietnamese: "si" },
  },
};

const curatedReadingMeanings = {
  行: {
    "匣母|唐韻|平聲|胡郎": "항렬, 줄, 대열. 사람이나 사물이 나란히 늘어선 차례.",
    "匣母|庚韻|平聲|戶庚": "가다, 걷다, 떠나다. 행동하다, 시행하다.",
    "匣母|唐韻|去聲|下浪": "차례, 순서, 등급.",
    "匣母|庚韻|去聲|下更": "행적, 일, 행위, 말.",
  },
  樂: {
    "疑母|肴韻|去聲|五教": "좋아하다, 즐겨 찾다.",
    "疑母|覺韻|入聲|五角": "음악, 악곡, 악기. 또 성씨.",
    "來母|鐸韻|入聲|盧各": "즐겁다, 기쁘다, 즐거움.",
  },
  長: {
    "澄母|陽韻|平聲|直良": "길다, 오래다, 멀다, 항상 그러하다.",
    "知母|陽韻|上聲|知丈": "크다, 우두머리, 어른.",
    "澄母|陽韻|去聲|直亮": "많다, 넉넉하다.",
  },
  重: {
    "澄母|鍾韻|平聲|直容": "거듭되다, 겹치다, 중복되다.",
    "澄母|鍾韻|上聲|直隴": "무겁다, 두텁다, 중대하다, 삼가다.",
    "澄母|鍾韻|去聲|柱用": "다시 하다, 거듭 행하다.",
  },
  中: {
    "知母|東韻|平聲|陟弓": "가운데, 알맞다, 맞다, 조화롭다.",
    "知母|東韻|去聲|陟仲": "맞히다, 적중하다, 들어맞다.",
  },
  傳: {
    "澄母|仙韻|平聲|直攣": "전하다, 옮기다, 이어 주다.",
    "澄母|仙韻|去聲|直戀": "전, 주석, 풀이. 후대에 전해 보이는 글.",
    "知母|仙韻|去聲|知戀": "역참, 전마, 사람이 머물며 교대하는 곳.",
  },
  數: {
    "生母|虞韻|上聲|所矩": "세다, 계산하다. 수효.",
    "生母|虞韻|去聲|色句": "수학, 산법, 계산법.",
    "生母|覺韻|入聲|所角": "자주, 빈번히.",
  },
  惡: {
    "影母|模韻|平聲|哀都": "어찌, 감탄 또는 의문을 나타내는 말.",
    "影母|模韻|去聲|烏路": "미워하다, 싫어하다.",
    "影母|鐸韻|入聲|烏各": "나쁘다, 악하다, 허물.",
  },
  解: {
    "匣母|佳韻|上聲|胡買": "깨닫다, 알다. 또 解廌 및 성씨.",
    "見母|佳韻|上聲|佳買": "풀다, 설명하다, 벗기다, 흩다.",
    "見母|佳韻|去聲|古隘": "제거하다, 없애다.",
    "匣母|佳韻|去聲|胡懈": "曲解, 고을 이름.",
  },
  說: {
    "書母|祭韻|去聲|舒芮": "달래다, 꾀다, 설득하다.",
    "以母|薛韻|入聲|弋雪": "성씨. 傅說의 이름에 쓰이는 독음.",
    "書母|薛韻|入聲|失爇": "말하다, 알리다, 뜻을 펴서 설명하다.",
  },
  便: {
    "並母|仙韻|平聲|房連": "말재주가 있다, 편안하다, 익숙하다. 또 성씨.",
    "並母|仙韻|去聲|婢面": "편리하다, 이롭다, 마땅하다.",
  },
  降: {
    "匣母|江韻|平聲|下江": "항복하다, 굴복하다.",
    "見母|江韻|去聲|古巷": "내리다, 떨어지다, 귀의하다.",
  },
  易: {
    "以母|支韻|去聲|以豉": "쉽다, 간단하다.",
    "以母|昔韻|入聲|羊益": "바꾸다, 변하다, 고치다. 또 지명·성씨.",
  },
  好: {
    "曉母|豪韻|上聲|呼晧": "좋다, 아름답다, 훌륭하다.",
    "曉母|豪韻|去聲|呼到": "좋아하다, 사랑하다, 즐기다.",
  },
  當: {
    "端母|唐韻|平聲|都郎": "마땅하다, 담당하다, 맞서다, 값이 맞다. 또 지명·성씨.",
    "端母|唐韻|去聲|丁浪": "맡다, 주관하다, 밑바탕이 되다.",
  },
  難: {
    "泥母|寒韻|平聲|那干": "어렵다, 쉽지 않다. 또 木難珠 및 성씨.",
    "泥母|寒韻|去聲|奴案": "재난, 근심, 환난.",
  },
  少: {
    "書母|宵韻|上聲|書沼": "적다, 많지 않다.",
    "書母|宵韻|去聲|失照": "어리다, 젊다. 少府 등 관직·복성에도 쓰임.",
  },
  上: {
    "常母|陽韻|上聲|時掌": "오르다, 올라가다.",
    "常母|陽韻|去聲|時亮": "위, 임금, 천자.",
  },
  將: {
    "精母|陽韻|平聲|即良": "보내다, 나아가다, 장차, 도우다. 또 성씨.",
    "精母|陽韻|去聲|子亮": "장수, 장군, 거느리다.",
  },
  相: {
    "心母|陽韻|平聲|息良": "서로, 함께, 보다. 相思木 및 성씨.",
    "心母|陽韻|去聲|息亮": "살피다, 돕다, 재상, 관직·지명·성씨.",
  },
  藏: {
    "從母|唐韻|平聲|昨郎": "숨기다, 감추다.",
    "從母|唐韻|去聲|徂浪": "곳집, 창고, 저장한 물건.",
  },
  朝: {
    "知母|宵韻|平聲|陟遙": "아침, 이른 때. 또 朝鮮 및 성씨.",
    "澄母|宵韻|平聲|直遙": "조정, 조회하다, 천자를 뵙다. 또 성씨.",
  },
  著: {
    "澄母|魚韻|平聲|直魚": "著雍. 太歲 명칭에 쓰이는 독음.",
    "知母|魚韻|上聲|丁呂": "맡기다, 두다.",
    "知母|魚韻|去聲|陟慮": "드러나다, 밝다, 두다, 세우다, 이루다.",
    "知母|藥韻|入聲|張略": "옷을 몸에 입다.",
    "澄母|藥韻|入聲|直略": "붙다, 부착하다.",
  },
  度: {
    "定母|模韻|去聲|徒故": "법도, 제도, 정도. 또 성씨.",
    "定母|鐸韻|入聲|徒落": "헤아리다, 재다, 도량.",
  },
  量: {
    "來母|陽韻|平聲|呂張": "재다, 헤아리다.",
    "來母|陽韻|平聲|呂章": "재다, 헤아리다.",
    "來母|陽韻|去聲|力讓": "용량, 말·되 등 부피 단위.",
  },
  過: {
    "見母|歌韻|平聲|古禾": "지나다, 지나가는 증표. 또 성씨.",
    "見母|歌韻|去聲|古臥": "허물, 잘못, 지나치다, 책망하다.",
    "見母|戈韻|平聲|古禾": "지나다, 지나가는 증표. 또 성씨.",
    "見母|戈韻|去聲|古臥": "허물, 잘못, 지나치다, 책망하다.",
  },
  應: {
    "影母|蒸韻|平聲|於陵": "마땅하다, 응당 그러하다. 또 성씨.",
    "影母|蒸韻|去聲|於證": "응하다, 서로 맞다, 반응하다.",
  },
  要: {
    "影母|宵韻|平聲|於霄": "허리, 요긴한 곳. 要離 계통 성씨에도 쓰임.",
    "影母|宵韻|去聲|於笑": "약속하다, 요구하다, 요약하다.",
  },
  與: {
    "以母|魚韻|平聲|以諸": "어조사, 말끝 조사. 安舒의 뜻.",
    "以母|魚韻|上聲|余呂": "무리, 함께함, 기다리다, 허락하다.",
    "以母|魚韻|去聲|羊洳": "참여하다, 함께하다.",
  },
  勝: {
    "書母|蒸韻|平聲|識蒸": "감당하다, 들어 올리다. 또 복성.",
    "書母|蒸韻|去聲|詩證": "이기다, 뛰어나다, 승리.",
    "心母|青韻|平聲|桑經": "이기다, 뛰어나다. 勝의 이체·통용 독음.",
  },
  從: {
    "從母|鍾韻|平聲|疾容": "따르다, 좇다, 나아가다. 또 성씨.",
    "清母|鍾韻|平聲|七恭": "從容, 침착하고 여유 있는 모양.",
    "從母|鍾韻|去聲|疾用": "수행하다, 따라가다.",
  },
  任: {
    "日母|侵韻|平聲|如林": "감당하다, 맡다, 보증하다. 또 성씨.",
    "日母|侵韻|去聲|汝鴆": "맡기다, 임무, 책임.",
  },
  更: {
    "見母|庚韻|平聲|古行": "바꾸다, 교대하다, 갚다.",
    "見母|庚韻|去聲|古孟": "다시, 고치다, 바꾸다.",
  },
  參: {
    "生母|侵韻|平聲|所今": "參星, 별 이름. 또 성씨.",
    "初母|侵韻|平聲|楚簪": "들쭉날쭉하다, 가지런하지 않다.",
    "清母|覃韻|平聲|倉含": "뵙다, 참여하다, 받들다.",
    "心母|談韻|平聲|蘇甘": "셋, 숫자 3. 또 복성.",
    "清母|覃韻|去聲|七紺": "參鼓. 북 이름·악기 관련 용례.",
  },
  華: {
    "匣母|麻韻|平聲|戶花": "꽃, 빛나다, 화려하다, 中華. 華表에도 쓰임.",
    "曉母|麻韻|平聲|呼瓜": "꽃, 꽃이 피다. 華/荂 계열.",
    "匣母|麻韻|去聲|胡化": "華山, 華州, 성씨 등 고유명사 계열.",
  },
  和: {
    "匣母|歌韻|平聲|戶戈": "화합하다, 고르다, 온화하다. 和州 및 성씨.",
    "匣母|歌韻|去聲|胡臥": "소리가 서로 맞다, 화답하다.",
    "匣母|戈韻|平聲|戶戈": "화합하다, 고르다, 온화하다. 和州 및 성씨.",
    "匣母|戈韻|去聲|胡臥": "소리가 서로 맞다, 화답하다.",
  },
  暴: {
    "並母|豪韻|去聲|薄報": "사납다, 갑작스럽다, 침범하다. 또 햇볕에 말리다.",
    "並母|屋韻|入聲|蒲木": "햇볕에 말리다, 볕에 쬐다.",
  },
  切: {
    "清母|齊韻|去聲|七計": "모두, 절실하다와 다른 계열의 독음.",
    "清母|屑韻|入聲|千結": "자르다, 새기다, 가깝다, 절실하다.",
  },
  空: {
    "溪母|東韻|平聲|苦紅": "비다, 공허하다. 司空 및 복성.",
    "溪母|東韻|去聲|苦貢": "비우다, 빈자리, 결원.",
  },
  親: {
    "清母|真韻|平聲|七人": "사랑하다, 가깝다, 친하다.",
    "清母|真韻|去聲|七遴": "사돈, 혼인으로 맺어진 친족.",
    "清母|眞韻|平聲|七人": "사랑하다, 가깝다, 친하다.",
    "清母|眞韻|去聲|七遴": "사돈, 혼인으로 맺어진 친족.",
  },
  奇: {
    "羣母|支韻|平聲|渠羈": "기이하다, 특이하다. 또 성씨.",
    "群母|支韻|平聲|渠羈": "기이하다, 특이하다. 또 성씨.",
    "見母|支韻|平聲|居宜": "홀수, 짝이 맞지 않다, 이지러지다.",
  },
  冠: {
    "見母|寒韻|平聲|古丸": "갓, 관, 머리에 쓰는 장식. 또 성씨.",
    "見母|寒韻|去聲|古玩": "관을 쓰다, 성년례를 하다.",
    "見母|桓韻|平聲|古丸": "갓, 관, 머리에 쓰는 장식. 또 성씨.",
    "見母|桓韻|去聲|古玩": "관을 쓰다, 성년례를 하다.",
  },
  禁: {
    "見母|侵韻|平聲|居吟": "감당하다, 이겨 내다, 힘이 미치다.",
    "見母|侵韻|去聲|居蔭": "금하다, 삼가다, 막다. 또 성씨.",
  },
  邪: {
    "以母|麻韻|平聲|以遮": "琅邪 지명, 어조사 耶와 통하는 독음.",
    "邪母|麻韻|平聲|似嗟": "사악하다, 바르지 않다.",
  },
  宿: {
    "心母|尤韻|去聲|息救": "별자리, 星宿. 머무르다의 뜻도 겸함.",
    "心母|屋韻|入聲|息逐": "묵다, 머무르다, 오래되다. 또 성씨.",
  },
  鮮: {
    "心母|仙韻|平聲|相然": "깨끗하다, 곱다, 신선하다. 鮮卑 및 성씨.",
    "心母|仙韻|上聲|息淺": "적다, 드물다.",
    "心母|仙韻|去聲|私箭": "성씨 등 고유명사 계열.",
  },
  盛: {
    "常母|清韻|平聲|是征": "그릇에 담다, 받아 담다.",
    "常母|清韻|去聲|承正": "성하다, 많다, 번성하다. 또 성씨.",
  },
  乘: {
    "船母|蒸韻|平聲|食陵": "타다, 오르다, 이용하다. 또 성씨.",
    "船母|蒸韻|去聲|實證": "수레, 탈것을 세는 단위.",
  },
  稱: {
    "昌母|蒸韻|平聲|處陵": "무게를 재다, 헤아리다. 또 성씨.",
    "昌母|蒸韻|去聲|昌孕": "걸맞다, 칭하다, 저울질하다.",
  },
  畜: {
    "徹母|尤韻|去聲|丑救": "가축, 짐승.",
    "曉母|屋韻|入聲|許竹": "기르다, 먹이다, 양육하다.",
    "曉母|尤韻|去聲|許救": "가축, 짐승.",
    "徹母|屋韻|入聲|丑六": "기르다, 먹이다, 양육하다.",
  },
  種: {
    "章母|鍾韻|上聲|之隴": "종류, 씨, 종족.",
    "章母|鍾韻|去聲|之用": "심다, 씨를 뿌리다.",
    "澄母|東韻|平聲|直弓": "씨, 종자, 종류.",
  },
  屬: {
    "章母|燭韻|入聲|之欲": "맡기다, 이어 붙이다, 무리, 관속.",
    "常母|燭韻|入聲|市玉": "붙다, 딸리다, 종류.",
  },
  否: {
    "並母|脂韻|上聲|符鄙": "막히다, 통하지 않다. 否卦.",
    "幫母|尤韻|上聲|方久": "아니다, 부정하다.",
  },
  食: {
    "以母|之韻|去聲|羊吏": "酈食其 등 인명에 쓰이는 독음.",
    "船母|職韻|入聲|乘力": "먹다, 음식, 밥. 또 성씨.",
  },
  率: {
    "生母|脂韻|去聲|所類": "새그물, 포획 도구.",
    "生母|質韻|入聲|所律": "거느리다, 따르다, 비율, 대체로.",
    "生母|術韻|入聲|所律": "거느리다, 따르다, 비율, 대체로.",
  },
  卷: {
    "羣母|仙韻|平聲|巨員": "굽다, 말리다.",
    "羣母|元韻|上聲|求晚": "성씨. 圈과 통하는 독음.",
    "群母|仙韻|平聲|巨員": "굽다, 말리다.",
    "群母|元韻|上聲|求晚": "성씨. 圈과 통하는 독음.",
    "見母|仙韻|上聲|居轉": "펴고 말다, 책권.",
    "見母|仙韻|去聲|居倦": "말다, 접다. 卷舒 계열.",
  },
  句: {
    "群母|虞韻|平聲|其俱": "冤句 등 지명에 쓰이는 독음.",
    "羣母|虞韻|平聲|其俱": "冤句 등 지명에 쓰이는 독음.",
    "見母|侯韻|平聲|古侯": "굽다, 구부러지다. 高句麗·句龍 등 고유명사.",
    "見母|虞韻|去聲|九遇": "글귀, 구절, 문장.",
    "見母|侯韻|去聲|古候": "맡다, 담당하다. 성씨 용례.",
  },
  假: {
    "見母|麻韻|上聲|古疋": "거짓, 빌리다, 임시의.",
    "見母|麻韻|去聲|古訝": "빌리다, 이르다, 휴가.",
  },
  差: {
    "初母|支韻|平聲|楚宜": "차이, 어긋남, 같지 않음.",
    "初母|佳韻|平聲|楚佳": "차이, 어긋남, 들쭉날쭉함.",
    "初母|皆韻|平聲|楚皆": "가리다, 선별하다.",
    "初母|麻韻|平聲|初加": "어긋나다, 벌어지다, 차이가 나다.",
    "初母|麻韻|平聲|初牙": "어긋나다, 벌어지다, 차이가 나다.",
    "初母|佳韻|去聲|楚懈": "병이 낫다, 조금 나아지다.",
  },
  幾: {
    "群母|微韻|平聲|渠希": "기미, 조짐, 일이 일어나려는 낌새.",
    "羣母|微韻|平聲|渠希": "기미, 조짐, 일이 일어나려는 낌새.",
    "見母|微韻|平聲|居依": "거의, 가까스로, 얼마 안 되는 정도.",
    "見母|微韻|上聲|居狶": "몇, 얼마, 수량을 묻거나 적음을 나타냄.",
    "見母|微韻|上聲|居豨": "몇, 얼마, 수량을 묻거나 적음을 나타냄.",
    "群母|微韻|去聲|其旣": "기계, 베틀, 사물의 작동 장치.",
    "羣母|微韻|去聲|其既": "기계, 베틀, 사물의 작동 장치.",
    "見母|脂韻|上聲|居履": "작은 안석, 기대는 낮은 책상. 几와 통하는 독음.",
  },
  曾: {
    "精母|登韻|平聲|作滕": "더하다, 거듭하다. 曾孫 등 친족 명칭.",
    "從母|登韻|平聲|昨楞": "일찍이, 이미, 전에.",
    "從母|登韻|平聲|昨棱": "일찍이, 이미, 전에.",
  },
  省: {
    "生母|庚韻|上聲|所景": "살피다, 돌아보다, 깨닫다. 생략하다.",
    "心母|清韻|上聲|息井": "관청, 성, 행정 구역. 덜다, 아끼다.",
  },
  校: {
    "匣母|肴韻|去聲|胡教": "학교, 교정하다, 비교하다.",
    "見母|肴韻|去聲|古孝": "울타리, 목책, 군영의 장교.",
  },
  塞: {
    "心母|咍韻|去聲|先代": "변방의 요새, 관문.",
    "心母|德韻|入聲|蘇則": "막다, 메우다, 막히다.",
  },
  背: {
    "並母|灰韻|去聲|蒲昧": "등, 뒤쪽, 뒷면.",
    "幫母|灰韻|去聲|補妹": "등지다, 배반하다, 외우다.",
  },
  被: {
    "並母|支韻|上聲|皮彼": "이불, 덮개, 몸에 걸치는 것.",
    "並母|支韻|去聲|平義": "입다, 덮다, 당하다. 피동 표지.",
  },
  散: {
    "心母|寒韻|上聲|蘇旱": "흩어져 있음, 한가함, 벼슬이 없음.",
    "心母|寒韻|去聲|蘇旰": "흩다, 나누어 보내다, 풀어지다.",
  },
  並: {
    "並母|青韻|上聲|蒲迥": "나란하다, 함께하다, 모두.",
    "幫母|清韻|平聲|府盈": "아우르다, 견주다. 并과 통하는 계열.",
    "幫母|清韻|去聲|畀政": "나란히 하다, 합치다, 함께 놓다.",
  },
  累: {
    "來母|支韻|上聲|力委": "쌓이다, 겹치다, 여러 차례.",
    "來母|支韻|去聲|良僞": "연루되다, 묶이다, 폐를 끼치다.",
    "來母|脂韻|平聲|力追": "밧줄, 매다, 이어 묶다.",
    "來母|脂韻|去聲|力遂": "지치다, 피로하다, 괴롭히다.",
  },
  繫: {
    "見母|齊韻|去聲|古詣": "매다, 이어 붙이다, 붙잡아 두다.",
    "匣母|齊韻|去聲|胡計": "걸리다, 관계되다, 이어져 있다.",
  },
  縣: {
    "匣母|先韻|平聲|胡涓": "매달다, 걸다. 懸과 통하는 독음.",
    "匣母|先韻|去聲|黃練": "현, 고을, 행정 구역.",
  },
  強: {
    "群母|陽韻|平聲|巨良": "굳세다, 강하다, 힘이 세다.",
    "羣母|陽韻|平聲|巨良": "굳세다, 강하다, 힘이 세다.",
    "群母|陽韻|上聲|其兩": "억지로 하다, 힘써 권하다.",
  },
  間: {
    "見母|山韻|平聲|古閑": "사이, 틈, 공간, 동안.",
    "見母|山韻|去聲|古莧": "끼어들다, 이간하다, 사이를 벌리다.",
  },
  觀: {
    "見母|寒韻|平聲|古丸": "보다, 살피다, 관찰하다.",
    "見母|寒韻|去聲|古玩": "볼거리, 모습, 누각. 易의 觀卦.",
    "見母|桓韻|平聲|古丸": "보다, 살피다, 관찰하다.",
    "見母|桓韻|去聲|古玩": "볼거리, 모습, 누각. 易의 觀卦.",
  },
  沈: {
    "澄母|侵韻|平聲|直深": "가라앉다, 잠기다, 깊이 빠지다.",
    "書母|侵韻|上聲|式任": "성씨. 瀋水·瀋陽 계열 지명에도 쓰임.",
    "書母|侵韻|上聲|式荏": "성씨. 瀋水·瀋陽 계열 지명에도 쓰임.",
    "澄母|侵韻|去聲|直禁": "물에 잠기게 하다, 가라앉히다.",
    "昌母|侵韻|上聲|昌枕": "즙, 액체가 배어 나오는 모양. 瀋과 통하는 독음.",
  },
  令: {
    "來母|仙韻|平聲|力延": "좋다, 아름답다. 令狐 등 성씨·복성 용례.",
    "來母|清韻|平聲|呂貞": "좋다, 훌륭하다, 남을 높이는 말.",
    "來母|青韻|平聲|郎丁": "좋다, 훌륭하다, 남을 높이는 말.",
    "來母|清韻|去聲|力政": "명령하다, 시키다, 관직명.",
    "來母|青韻|去聲|郎定": "명령하다, 시키다, 관직명.",
  },
  卒: {
    "精母|術韻|入聲|子聿": "마치다, 끝내다, 마침내.",
    "精母|質韻|入聲|子聿": "마치다, 끝내다, 마침내.",
    "清母|沒韻|入聲|倉没": "갑자기, 급히. 猝과 통하는 독음.",
    "清母|沒韻|入聲|倉沒": "갑자기, 급히. 猝과 통하는 독음.",
    "精母|沒韻|入聲|臧没": "군졸, 병사, 하인.",
    "精母|沒韻|入聲|臧沒": "군졸, 병사, 하인.",
  },
  只: {
    "章母|支韻|平聲|章移": "어조사, 다만, 오직.",
    "章母|支韻|上聲|諸氏": "오직, 단지, 하나뿐임.",
    "章母|昔韻|入聲|之石": "새 이름, 짝이 없는 모양.",
    "章母|職韻|入聲|之翼": "새 이름, 짝이 없는 모양.",
    "羣母|支韻|平聲|巨支": "땅 이름 등 고유명사 계열.",
  },
  折: {
    "定母|齊韻|平聲|杜奚": "꺾이다, 끊어지다. 고유명사 계열.",
    "章母|薛韻|入聲|旨熱": "꺾다, 부러뜨리다, 접다.",
    "常母|薛韻|入聲|常列": "부러지다, 꺾이다, 손상되다.",
    "來母|合韻|入聲|盧合": "꺾이다, 무너지다. 拉과 통하는 계열.",
    "章母|葉韻|入聲|之涉": "말재주, 변론. 請折 계열 용례.",
  },
  比: {
    "並母|脂韻|平聲|房脂": "가깝다, 친하다, 나란하다.",
    "幫母|脂韻|上聲|卑履": "견주다, 비교하다, 비율.",
    "並母|脂韻|去聲|毗至": "이웃하다, 가까이 붙다.",
    "幫母|脂韻|去聲|必至": "잇따르다, 미치다, 이르다.",
    "並母|質韻|入聲|毗必": "촘촘하다, 빽빽하다. 祕와 통하는 계열.",
  },
  戲: {
    "曉母|支韻|平聲|許羈": "탄식하는 소리, 감탄사.",
    "曉母|模韻|平聲|荒烏": "呼와 통하는 감탄·부름 계열.",
    "曉母|支韻|去聲|香義": "놀이, 연극, 희롱하다.",
  },
  斷: {
    "端母|桓韻|上聲|都管": "끊다, 자르다, 판단하다.",
    "定母|桓韻|上聲|徒管": "끊어지다, 단절되다.",
    "端母|桓韻|去聲|丁貫": "결정하다, 판결하다, 단호히 하다.",
    "端母|寒韻|上聲|都管": "끊다, 자르다, 판단하다.",
    "定母|寒韻|上聲|徒管": "끊어지다, 단절되다.",
    "端母|寒韻|去聲|丁貫": "결정하다, 판결하다, 단호히 하다.",
  },
  極: {
    "群母|職韻|入聲|渠力": "끝, 지극함, 표준, 북극.",
    "羣母|職韻|入聲|渠力": "끝, 지극함, 표준, 북극.",
    "群母|葉韻|入聲|其輒": "급히, 빠르게. 亟과 통하는 계열.",
    "羣母|葉韻|入聲|其輒": "급히, 빠르게. 亟과 통하는 계열.",
    "群母|業韻|入聲|巨業": "지치다, 다하다, 끝까지 이르다.",
    "羣母|業韻|入聲|巨業": "지치다, 다하다, 끝까지 이르다.",
  },
  別: {
    "並母|薛韻|入聲|皮列": "나누다, 구별하다, 헤어지다.",
    "幫母|薛韻|入聲|方别": "따로, 달리, 다른 것.",
    "幫母|薛韻|入聲|方別": "따로, 달리, 다른 것.",
    "幫母|祭韻|去聲|必袂": "이별하다, 갈라서다.",
  },
  借: {
    "精母|麻韻|去聲|子夜": "빌리다, 빌려 주다, 핑계 삼다.",
    "精母|昔韻|入聲|資昔": "가령, 만일, 임시로.",
    "從母|麻韻|去聲|慈夜": "빌리다, 의지하다. 藉와 통하는 독음.",
    "從母|昔韻|入聲|秦昔": "깔개, 의지하다. 藉와 통하는 독음.",
  },
  繁: {
    "並母|元韻|平聲|附袁": "많다, 번성하다, 복잡하다.",
    "並母|寒韻|平聲|薄官": "성씨, 지명. 蕃과 통하는 계열.",
    "並母|桓韻|平聲|薄官": "성씨, 지명. 蕃과 통하는 계열.",
    "並母|歌韻|平聲|薄波": "말의 갈기 장식, 흰빛 무늬.",
    "並母|戈韻|平聲|薄波": "말의 갈기 장식, 흰빛 무늬.",
  },
  使: {
    "生母|之韻|上聲|踈士": "부리다, 시키다, 사신.",
    "生母|之韻|上聲|疎士": "부리다, 시키다, 사신.",
    "生母|之韻|去聲|踈吏": "사신으로 보내다, 명령하여 하게 하다.",
    "生母|之韻|去聲|疎吏": "사신으로 보내다, 명령하여 하게 하다.",
  },
  伴: {
    "並母|桓韻|上聲|蒲旱": "짝, 동무, 함께하는 사람.",
    "並母|寒韻|上聲|蒲旱": "짝, 동무, 함께하는 사람.",
    "並母|桓韻|去聲|薄半": "동반하다, 함께하다.",
    "並母|寒韻|去聲|薄半": "동반하다, 함께하다.",
  },
  併: {
    "幫母|清韻|上聲|必郢": "합치다, 아우르다.",
    "並母|青韻|上聲|蒲迥": "나란히 하다, 함께하다.",
    "幫母|清韻|去聲|畀政": "합병하다, 함께 넣다.",
    "幫母|清韻|平聲|府盈": "견주다, 나란하다. 並과 통하는 계열.",
  },
  番: {
    "並母|元韻|平聲|附袁": "짐승의 발, 발자국. 蹯과 통하는 계열.",
    "滂母|元韻|平聲|孚袁": "차례, 번, 되풀이하다.",
    "滂母|桓韻|平聲|普官": "番禺 등 지명에 쓰이는 독음.",
    "滂母|寒韻|平聲|普官": "番禺 등 지명에 쓰이는 독음.",
    "幫母|戈韻|平聲|博禾": "굳세고 용맹한 모양.",
    "幫母|歌韻|平聲|博禾": "굳세고 용맹한 모양.",
    "幫母|戈韻|去聲|補過": "짐승이 달아나는 모양.",
    "幫母|歌韻|去聲|補過": "짐승이 달아나는 모양.",
  },
  劃: {
    "匣母|麥韻|入聲|胡麥": "긋다, 나누다, 경계를 정하다.",
    "曉母|麥韻|入聲|呼麥": "갈라지는 소리, 빠르게 긋는 모양.",
    "匣母|麻韻|平聲|戶花": "배를 젓다. 划와 통하는 독음.",
    "見母|戈韻|上聲|古火": "계획하다, 헤아리다. 畫와 통하는 계열.",
    "見母|歌韻|上聲|古火": "계획하다, 헤아리다. 畫와 통하는 계열.",
    "見母|戈韻|去聲|古臥": "그림, 획, 구획.",
    "見母|歌韻|去聲|古臥": "그림, 획, 구획.",
  },
  划: {
    "匣母|麻韻|平聲|戶花": "노를 젓다, 배를 젓다.",
    "見母|戈韻|上聲|古火": "긋다, 나누다, 계획하다.",
    "見母|歌韻|上聲|古火": "긋다, 나누다, 계획하다.",
    "見母|戈韻|去聲|古臥": "획, 구획, 긋는 일.",
    "見母|歌韻|去聲|古臥": "획, 구획, 긋는 일.",
    "匣母|麥韻|入聲|胡麥": "나누다, 가르다. 劃과 통하는 독음.",
    "曉母|麥韻|入聲|呼麥": "갈라지는 소리, 빠르게 긋는 모양.",
  },
  扮: {
    "幫母|文韻|平聲|府文": "나누다, 흩뜨리다. 分과 통하는 계열.",
    "曉母|佳韻|上聲|花夥": "꾸미다, 치장하다.",
    "幫母|文韻|上聲|方吻": "꾸미다, 분장하다.",
    "並母|文韻|上聲|房吻": "섞이다, 어지럽게 흩어지다.",
    "幫母|山韻|去聲|脯幻": "분장하다, 가장하다.",
    "幫母|山韻|去聲|晡幻": "분장하다, 가장하다.",
    "見母|黠韻|入聲|花黠": "찢다, 가르다.",
  },
  圈: {
    "群母|元韻|上聲|求晚": "우리, 가축을 가두는 울.",
    "羣母|元韻|上聲|求晚": "우리, 가축을 가두는 울.",
    "群母|仙韻|上聲|渠篆": "둥글게 말다, 둘러싸다.",
    "羣母|仙韻|上聲|渠篆": "둥글게 말다, 둘러싸다.",
    "群母|元韻|去聲|臼万": "둘러 가두다, 감싸다.",
    "羣母|元韻|去聲|臼万": "둘러 가두다, 감싸다.",
  },
  填: {
    "知母|眞韻|平聲|陟鄰": "북소리, 크게 울리는 소리.",
    "知母|真韻|平聲|陟鄰": "북소리, 크게 울리는 소리.",
    "定母|先韻|平聲|徒年": "메우다, 채우다, 보충하다.",
    "知母|眞韻|去聲|陟刃": "막히다, 가득 차다.",
    "知母|真韻|去聲|陟刃": "막히다, 가득 차다.",
    "定母|先韻|去聲|堂練": "채워 넣다, 메워 완성하다.",
  },
  塡: {
    "知母|眞韻|平聲|陟鄰": "북소리, 크게 울리는 소리.",
    "知母|真韻|平聲|陟鄰": "북소리, 크게 울리는 소리.",
    "定母|先韻|平聲|徒年": "메우다, 채우다, 보충하다.",
    "知母|眞韻|去聲|陟刃": "막히다, 가득 차다.",
    "知母|真韻|去聲|陟刃": "막히다, 가득 차다.",
    "定母|先韻|去聲|堂練": "채워 넣다, 메워 완성하다.",
  },
  廣: {
    "見母|唐韻|上聲|古晃": "넓다, 넓히다, 광대하다.",
    "疑母|鹽韻|上聲|魚檢": "집의 옆채, 큰 집. 广과 통하는 독음.",
    "疑母|嚴韻|上聲|魚掩": "집의 옆채, 큰 집. 广과 통하는 독음.",
    "疑母|嚴韻|上聲|魚埯": "집의 옆채, 큰 집. 广과 통하는 독음.",
  },
  广: {
    "疑母|鹽韻|上聲|魚檢": "집의 옆채, 언덕집, 넓은 집.",
    "疑母|嚴韻|上聲|魚掩": "집의 옆채, 언덕집, 넓은 집.",
    "疑母|嚴韻|上聲|魚埯": "집의 옆채, 언덕집, 넓은 집.",
    "見母|唐韻|上聲|古晃": "넓다, 넓히다. 廣과 통하는 독음.",
  },
  敦: {
    "端母|灰韻|平聲|都回": "제기 이름, 두터운 그릇.",
    "端母|魂韻|平聲|都昆": "두텁다, 정성스럽다, 도탑다.",
    "定母|桓韻|平聲|度官": "둥글고 두꺼운 모양.",
    "定母|寒韻|平聲|度官": "둥글고 두꺼운 모양.",
    "端母|魂韻|去聲|都困": "재촉하다, 다그치다.",
  },
  單: {
    "端母|寒韻|平聲|都寒": "홑, 하나, 단독.",
    "常母|仙韻|平聲|市連": "單于, 흉노 군주의 칭호.",
    "常母|仙韻|上聲|常演": "크다, 넓다. 고유명사 계열.",
    "常母|仙韻|去聲|時戰": "성씨, 지명 등 고유명사 계열.",
  },
  向: {
    "書母|陽韻|去聲|式亮": "향하다, 방향, 마주하다.",
    "曉母|陽韻|去聲|許亮": "지난날, 이전, 조금 전.",
    "曉母|陽韻|上聲|許兩": "창문이 북쪽으로 난 모양. 嚮과 통하는 계열.",
    "書母|陽韻|上聲|書兩": "향하다, 바라보다. 嚮과 통하는 계열.",
  },
  吟: {
    "疑母|侵韻|平聲|魚金": "읊다, 노래하다, 시를 짓다.",
    "疑母|侵韻|去聲|宜禁": "탄식하다, 끙끙거리다, 낮게 읊조리다.",
  },
  員: {
    "云母|仙韻|平聲|王權": "둥글다, 원형. 圓과 통하는 계열.",
    "云母|文韻|平聲|王分": "사람 수, 인원, 관원.",
    "云母|文韻|去聲|王問": "더하다, 늘리다. 운용상 드문 독음.",
  },
  坐: {
    "從母|戈韻|上聲|徂果": "앉다, 자리, 앉아 있음.",
    "從母|歌韻|上聲|徂果": "앉다, 자리, 앉아 있음.",
    "從母|戈韻|去聲|徂臥": "죄에 걸리다, 연좌되다, 까닭으로.",
    "從母|歌韻|去聲|徂臥": "죄에 걸리다, 연좌되다, 까닭으로.",
  },
  契: {
    "溪母|齊韻|去聲|苦計": "계약, 약속, 문서.",
    "溪母|屑韻|入聲|苦結": "새기다, 파다, 맺다.",
    "溪母|迄韻|入聲|去迄": "契丹의 契에 쓰이는 독음.",
    "溪母|殷韻|入聲|去訖": "契丹의 契에 쓰이는 독음.",
  },
  女: {
    "娘母|魚韻|上聲|尼呂": "여자, 딸, 여성.",
    "孃母|魚韻|上聲|尼呂": "여자, 딸, 여성.",
    "娘母|魚韻|去聲|尼據": "시집보내다, 딸로 여기다.",
    "孃母|魚韻|去聲|尼據": "시집보내다, 딸로 여기다.",
  },
  葉: {
    "以母|葉韻|入聲|與涉": "잎, 나뭇잎, 책의 쪽, 시대·세대.",
    "書母|葉韻|入聲|書涉": "맞다, 화합하다, 운이 맞다. 協과 통하는 독음.",
    "匣母|怗韻|入聲|胡頰": "좁고 얇은 모양, 고유명사·통용자 계열.",
  },
  舍: {
    "書母|麻韻|上聲|書冶": "버리다, 놓아 주다, 베풀다.",
    "書母|麻韻|去聲|始夜": "집, 숙소, 머무는 곳. 舍人 등 관직명.",
  },
  車: {
    "昌母|麻韻|平聲|尺遮": "수레, 차, 탈것.",
    "見母|魚韻|平聲|九魚": "車渠 등 보석·고유명사 계열의 독음.",
  },
  系: {
    "見母|齊韻|去聲|古詣": "매다, 잇다, 관계 짓다.",
    "匣母|齊韻|去聲|胡計": "계통, 줄기, 이어진 관계. 繫와 통하는 계열.",
  },
  谷: {
    "見母|屋韻|入聲|古禄": "골짜기, 골.",
    "見母|屋韻|入聲|古祿": "골짜기, 골.",
    "來母|屋韻|入聲|盧谷": "녹봉, 복록. 祿과 통하는 독음.",
    "以母|燭韻|入聲|余蜀": "기르다, 자라게 하다. 育과 통하는 계열.",
  },
  射: {
    "船母|麻韻|去聲|神夜": "쏘다, 활을 쏘다, 빛을 내쏘다.",
    "以母|麻韻|去聲|羊謝": "싫어하다, 물리다. 厭과 통하는 계열.",
    "以母|昔韻|入聲|羊益": "쏘다, 맞히다. 고유명사·통용 독음.",
    "船母|昔韻|入聲|食亦": "射干 등 식물명·고유명사 계열.",
  },
  識: {
    "書母|職韻|入聲|賞職": "알다, 알아보다, 지식.",
    "章母|之韻|去聲|職吏": "표지, 기억하다, 기록하다.",
  },
  論: {
    "來母|真韻|平聲|力迍": "논어, 차례, 말의 조리. 倫과 통하는 계열.",
    "來母|諄韻|平聲|力迍": "논어, 차례, 말의 조리. 倫과 통하는 계열.",
    "來母|魂韻|平聲|盧昆": "차례, 분류, 무리. 倫과 통하는 계열.",
    "來母|魂韻|去聲|盧困": "논하다, 토론하다, 논설.",
  },
  畫: {
    "匣母|佳韻|去聲|胡卦": "그림, 그리다, 선을 긋다.",
    "匣母|麥韻|入聲|胡麥": "가르다, 구획하다, 획을 긋다.",
  },
  復: {
    "並母|屋韻|入聲|房六": "돌아오다, 회복하다, 다시.",
    "並母|尤韻|去聲|扶富": "다시 하다, 반복하다. 複과 통하는 계열.",
  },
  離: {
    "來母|支韻|平聲|呂支": "떠나다, 떨어지다, 붙다. 離卦.",
    "來母|支韻|去聲|力智": "떠나다, 나뉘다, 분리되다.",
    "來母|齊韻|去聲|郎計": "걸리다, 지나다, 재난을 만나다.",
    "徹母|支韻|平聲|丑知": "짐승 이름, 산신·고유명사 계열.",
  },
  聽: {
    "疑母|眞韻|上聲|宜引": "웃는 모양, 입을 벌리는 모양.",
    "疑母|真韻|上聲|宜引": "웃는 모양, 입을 벌리는 모양.",
    "疑母|欣韻|上聲|牛謹": "웃는 모양, 기뻐하는 모양.",
    "疑母|殷韻|上聲|牛謹": "웃는 모양, 기뻐하는 모양.",
    "透母|青韻|平聲|他丁": "듣다, 따르다, 들어 주다.",
    "透母|青韻|去聲|他定": "듣게 하다, 맡기다, 허락하다.",
  },
  亂: {
    "來母|桓韻|去聲|郎段": "어지럽다, 혼란, 난리.",
    "來母|寒韻|去聲|郎段": "어지럽다, 혼란, 난리.",
  },
  占: {
    "章母|鹽韻|平聲|職廉": "점치다, 징조를 살피다.",
    "章母|鹽韻|去聲|章豔": "차지하다, 점거하다, 머무르다.",
  },
  召: {
    "澄母|宵韻|去聲|直照": "부르다, 불러 모으다.",
    "常母|宵韻|去聲|寔照": "임금의 명령, 조서. 詔와 통하는 독음.",
  },
  干: {
    "見母|寒韻|平聲|古寒": "방패, 줄기, 범하다, 간여하다.",
    "見母|寒韻|去聲|古案": "마르다, 말리다. 乾과 통하는 독음.",
    "群母|仙韻|平聲|渠焉": "시내가에 높은 언덕, 물가.",
    "羣母|仙韻|平聲|渠焉": "시내가에 높은 언덕, 물가.",
  },
  思: {
    "心母|之韻|平聲|息兹": "생각하다, 그리워하다, 사유.",
    "心母|之韻|去聲|相吏": "생각, 뜻, 마음의 움직임.",
  },
  正: {
    "章母|清韻|平聲|諸盈": "정월, 첫 달. 또 바름의 뜻.",
    "章母|清韻|去聲|之盛": "바르다, 바로잡다, 정하다.",
  },
  濟: {
    "精母|齊韻|上聲|子禮": "많고 성대한 모양. 濟濟 계열.",
    "精母|齊韻|去聲|子計": "건너다, 구제하다, 이루다.",
  },
  炮: {
    "並母|肴韻|平聲|薄交": "불에 굽다, 볶다, 포제하다.",
    "滂母|肴韻|去聲|匹皃": "대포, 포성. 후대 관용 계열.",
  },
  看: {
    "溪母|寒韻|平聲|苦寒": "지키다, 보살피다, 살피다.",
    "溪母|寒韻|去聲|苦旰": "보다, 바라보다, 조사하다.",
  },
  給: {
    "見母|緝韻|入聲|居立": "넉넉하다, 공급하다, 주다.",
  },
  覺: {
    "見母|肴韻|去聲|古孝": "잠에서 깨다, 깨닫게 하다.",
    "見母|覺韻|入聲|古岳": "깨닫다, 알다, 감각.",
  },
  轉: {
    "知母|仙韻|上聲|陟兗": "구르다, 돌다, 바뀌다.",
    "知母|仙韻|上聲|陟兖": "구르다, 돌다, 바뀌다.",
    "知母|仙韻|去聲|知戀": "굴리다, 옮기다, 전하다.",
  },
  騎: {
    "羣母|支韻|平聲|渠羈": "말을 타다, 올라타다.",
    "群母|支韻|平聲|渠羈": "말을 타다, 올라타다.",
    "羣母|支韻|去聲|奇寄": "기병, 말 탄 사람, 타는 말.",
    "群母|支韻|去聲|奇寄": "기병, 말 탄 사람, 타는 말.",
  },
  齊: {
    "從母|齊韻|平聲|徂奚": "가지런하다, 같다, 제나라.",
    "從母|齊韻|去聲|在詣": "재계하다, 몸과 마음을 삼가다. 齋와 통하는 독음.",
  },
  作: {
    "精母|模韻|去聲|臧祚": "일어나다, 일으키다, 짓다.",
    "精母|歌韻|去聲|則箇": "짓다, 만들다, 하다.",
    "精母|鐸韻|入聲|則落": "만들다, 저술하다, 행동하다.",
  },
  供: {
    "見母|鍾韻|平聲|九容": "바치다, 공양하다, 공급하다.",
    "見母|鍾韻|去聲|居用": "진술하다, 자백하다, 바치게 하다.",
  },
  興: {
    "曉母|蒸韻|平聲|虛陵": "일어나다, 흥하다, 시작하다.",
    "曉母|蒸韻|平聲|虚陵": "일어나다, 흥하다, 시작하다.",
    "曉母|蒸韻|去聲|許應": "흥취, 흥미, 시적 감흥.",
  },
  號: {
    "匣母|豪韻|平聲|胡刀": "부르짖다, 울부짖다.",
    "匣母|豪韻|去聲|胡倒": "이름, 부호, 번호, 칭호.",
    "匣母|豪韻|去聲|胡到": "이름, 부호, 번호, 칭호.",
  },
  咽: {
    "影母|先韻|平聲|烏前": "목구멍, 인후.",
    "影母|先韻|去聲|於甸": "삼키다, 목메다.",
    "影母|屑韻|入聲|烏結": "목이 메다, 소리가 막히다.",
  },
  處: {
    "昌母|魚韻|上聲|昌與": "살다, 머무르다, 처하다.",
    "昌母|魚韻|去聲|昌據": "곳, 장소, 처소.",
  },
  夏: {
    "匣母|麻韻|上聲|胡雅": "여름, 하나라, 중국.",
    "匣母|麻韻|去聲|胡駕": "크다, 위엄 있다, 아악의 춤 이름.",
  },
  寧: {
    "澄母|魚韻|平聲|直魚": "쌓인 물, 저장하다. 貯와 통하는 계열.",
    "澄母|魚韻|上聲|直呂": "쌓다, 모아 두다. 貯와 통하는 계열.",
    "泥母|青韻|平聲|奴丁": "편안하다, 안정되다, 어찌.",
  },
  彈: {
    "定母|寒韻|平聲|徒干": "탄환, 작은 알, 새총의 돌.",
    "定母|寒韻|去聲|徒案": "튀기다, 연주하다, 탄핵하다.",
  },
  征: {
    "章母|清韻|平聲|諸盈": "바르게 가다, 징조, 세금.",
    "知母|蒸韻|平聲|陟陵": "치다, 정벌하다, 멀리 가다.",
    "知母|之韻|上聲|陟里": "부르다, 징발하다. 徵과 통하는 독음.",
  },
  施: {
    "書母|支韻|平聲|式支": "베풀다, 시행하다, 펼치다.",
    "書母|支韻|去聲|施智": "옮기다, 미치다, 베풀어 주다.",
  },
  望: {
    "明母|陽韻|平聲|武方": "멀리 바라보다, 보름달.",
    "明母|陽韻|去聲|巫放": "희망하다, 명망, 바라봄.",
  },
  治: {
    "澄母|之韻|平聲|直之": "물이 흐르는 이름, 지명 계열.",
    "澄母|脂韻|去聲|直利": "다스리다, 고치다, 처리하다.",
    "澄母|之韻|去聲|直吏": "다스리다, 정치하다, 안정시키다.",
  },
  漂: {
    "滂母|宵韻|平聲|撫招": "물에 뜨다, 떠돌다.",
    "滂母|宵韻|去聲|匹妙": "빨래하다, 물에 씻다, 희게 하다.",
  },
  王: {
    "云母|陽韻|平聲|雨方": "임금, 왕, 왕실.",
    "云母|陽韻|去聲|于放": "왕 노릇 하다, 다스리다.",
  },
  生: {
    "生母|庚韻|平聲|所庚": "나다, 살다, 삶, 날것.",
    "生母|庚韻|去聲|所敬": "낳다, 살리다, 생기게 하다.",
  },
  索: {
    "心母|鐸韻|入聲|蘇各": "찾다, 구하다, 요구하다.",
    "生母|陌韻|入聲|山戟": "쓸쓸하다, 흩어지다. 索然 계열.",
    "生母|麥韻|入聲|山責": "큰 노끈, 새끼줄.",
  },
};

function japaneseReadingsForChar(char) {
  const sources = [
    typeof ALL_JAPANESE_READINGS !== "undefined" ? ALL_JAPANESE_READINGS : null,
    typeof JAPANESE_GO_KAN_READINGS !== "undefined" ? JAPANESE_GO_KAN_READINGS : null,
  ].filter(Boolean);
  for (const candidate of hanVariantCandidates(char)) {
    for (const source of sources) {
      if (source[candidate]) return source[candidate];
    }
  }
  return null;
}

function japaneseOnKanaForChar(char, ownRaw, rawByChar) {
  const allowed = allowedJapaneseOnSet(japaneseOnToKatakana(ownRaw || ""));
  for (const candidate of hanVariantCandidates(char)) {
    for (const token of allowedJapaneseOnSet(japaneseOnToKatakana(rawByChar.get(candidate) || ""))) {
      allowed.add(token);
    }
  }
  return [...allowed].join(" ");
}

function filterJapaneseReadingsToAllowed(reading, allowedKana) {
  if (!reading || !allowedKana) return reading;
  const allowed = allowedJapaneseOnSet(allowedKana);
  const filtered = {};
  for (const key of ["go", "kan", "kanyo"]) {
    const current = reading[key];
    if (!current) continue;
    const originalModern = splitJapaneseReadingTokens(current.modernKana);
    const modern = originalModern.filter((token) => allowed.has(token));
    if (modern.length) {
      filtered[key] = {
        modernKana: [...new Set(modern)].join(" "),
        historicalKana: current.historicalKana || "",
      };
    }
  }
  removeRedundantJapaneseKanyo(filtered);
  return filtered.go || filtered.kan || filtered.kanyo ? filtered : null;
}

function removeRedundantJapaneseKanyo(reading) {
  if (!reading?.kanyo?.modernKana) return;
  const regular = new Set([
    ...splitJapaneseReadingTokens(reading.go?.modernKana),
    ...splitJapaneseReadingTokens(reading.kan?.modernKana),
  ]);
  if (!regular.size) return;
  const modern = splitJapaneseReadingTokens(reading.kanyo.modernKana).filter((token) => !regular.has(token));
  if (modern.length) {
    reading.kanyo = {
      modernKana: [...new Set(modern)].join(" "),
      historicalKana: reading.kanyo.historicalKana || "",
    };
  } else {
    delete reading.kanyo;
  }
}

function allowedJapaneseOnSet(kana) {
  const allowed = new Set(splitJapaneseReadingTokens(kana));
  for (const token of [...allowed]) {
    if (token.endsWith("ツ") && token.length > 1) allowed.add(`${token.slice(0, -1)}ッ`);
  }
  return allowed;
}

function middleChineseReadingGroups(char) {
  return [
    typeof ALL_MIDDLE_CHINESE_READINGS !== "undefined" ? ALL_MIDDLE_CHINESE_READINGS[char] : null,
    typeof MIDDLE_CHINESE_READINGS !== "undefined" ? MIDDLE_CHINESE_READINGS[char] : null,
    typeof TSHET_UINH_MIDDLE_CHINESE_READINGS !== "undefined" ? TSHET_UINH_MIDDLE_CHINESE_READINGS[char] : null,
    typeof WIKIHAN_MIDDLE_CHINESE_READINGS !== "undefined" ? WIKIHAN_MIDDLE_CHINESE_READINGS[char] : null,
  ];
}

function middleChineseReadingCandidates(char) {
  return [...new Set([
    ...hanVariantCandidates(char),
  ])];
}

const hanVariantCandidatesCache = new Map();

function hanVariantCandidates(char) {
  if (hanVariantCandidatesCache.has(char)) return hanVariantCandidatesCache.get(char);
  const candidates = new Set([char]);
  const normalized = char.normalize("NFKC");
  if (normalized && normalized !== char) candidates.add(normalized);
  const variants = typeof HAN_VARIANTS !== "undefined" ? HAN_VARIANTS : {};
  for (const variant of variants[char] || []) candidates.add(variant);
  for (const variant of variants[normalized] || []) candidates.add(variant);
  for (const variant of hanReverseVariantsForChar(char)) candidates.add(variant);
  for (const variant of hanReverseVariantsForChar(normalized)) candidates.add(variant);
  for (const variant of hanDisplayFormVariantsForChar(char)) candidates.add(variant);
  for (const variant of hanDisplayFormVariantsForChar(normalized)) candidates.add(variant);
  const result = [...candidates];
  hanVariantCandidatesCache.set(char, result);
  return result;
}

function hanTraditionalSearchCandidates(char) {
  return [...hanVariantCandidates(char)].sort((a, b) => {
    const ar = compactDictionaryRowsByChar?.has(a) ? 0 : 1;
    const br = compactDictionaryRowsByChar?.has(b) ? 0 : 1;
    if (ar !== br) return ar - br;
    return hanTraditionalPreferenceScore(a) - hanTraditionalPreferenceScore(b);
  });
}

function hanTraditionalPreferenceScore(char) {
  const forms = typeof HAN_DISPLAY_FORMS !== "undefined" ? HAN_DISPLAY_FORMS : {};
  const simplified = forms.simplified?.[char] || "";
  const japanese = forms.japanese?.[char] || "";
  let score = 10;
  if (simplified && simplified !== char) score -= 6;
  if (japanese && japanese !== char) score -= 2;
  if (hanReverseVariantsForChar(char).length) score += 3;
  return score;
}

let hanReverseVariantsCache = null;

function hanReverseVariantsForChar(char) {
  if (!char) return [];
  if (!hanReverseVariantsCache) {
    hanReverseVariantsCache = new Map();
    const variants = typeof HAN_VARIANTS !== "undefined" ? HAN_VARIANTS : {};
    for (const [base, values] of Object.entries(variants)) {
      for (const value of values || []) {
        if (!hanReverseVariantsCache.has(value)) hanReverseVariantsCache.set(value, []);
        hanReverseVariantsCache.get(value).push(base);
      }
    }
  }
  return hanReverseVariantsCache.get(char) || [];
}

let hanDisplayFormVariantsCache = null;

function hanDisplayFormVariantsForChar(char) {
  if (!char) return [];
  if (!hanDisplayFormVariantsCache) {
    hanDisplayFormVariantsCache = new Map();
    const forms = typeof HAN_DISPLAY_FORMS !== "undefined" ? HAN_DISPLAY_FORMS : {};
    for (const map of [forms.simplified, forms.japanese].filter(Boolean)) {
      for (const [traditional, display] of Object.entries(map)) {
        if (!hanDisplayFormVariantsCache.has(traditional)) hanDisplayFormVariantsCache.set(traditional, []);
        hanDisplayFormVariantsCache.get(traditional).push(display);
        if (!hanDisplayFormVariantsCache.has(display)) hanDisplayFormVariantsCache.set(display, []);
        hanDisplayFormVariantsCache.get(display).push(traditional);
      }
    }
  }
  return hanDisplayFormVariantsCache.get(char) || [];
}

let hanDisplayFormSourcesCache = null;

function hanDisplayFormSourcesForChar(char) {
  if (!char) return [];
  if (!hanDisplayFormSourcesCache) {
    hanDisplayFormSourcesCache = new Map();
    const forms = typeof HAN_DISPLAY_FORMS !== "undefined" ? HAN_DISPLAY_FORMS : {};
    for (const map of [forms.simplified, forms.japanese].filter(Boolean)) {
      for (const [traditional, display] of Object.entries(map)) {
        if (!display || traditional === display) continue;
        if (!hanDisplayFormSourcesCache.has(display)) hanDisplayFormSourcesCache.set(display, []);
        hanDisplayFormSourcesCache.get(display).push(traditional);
      }
    }
  }
  return hanDisplayFormSourcesCache.get(char) || [];
}

function hanDisplayFormsForChar(char) {
  const forms = typeof HAN_DISPLAY_FORMS !== "undefined" ? HAN_DISPLAY_FORMS : {};
  const simplified = forms.simplified?.[char] || "";
  const japanese = forms.japanese?.[char] || "";
  return {
    simplified: simplified && simplified !== char ? simplified : "",
    japanese: japanese && japanese !== char ? japanese : "",
  };
}

function combineMiddleChineseReadings(...groups) {
  const readings = [];
  const signatureIndex = new Map();
  groups.flatMap((group) => group || []).forEach((reading) => {
    const signatures = middleChineseReadingSignatures(reading);
    const existingIndex = signatures.map((signature) => signatureIndex.get(signature)).find((index) => index !== undefined);
    if (existingIndex !== undefined) {
      readings[existingIndex] = mergeMiddleChineseReading(readings[existingIndex], reading);
      middleChineseReadingSignatures(readings[existingIndex]).forEach((signature) => signatureIndex.set(signature, existingIndex));
      return;
    }

    const nextIndex = readings.length;
    readings.push(reading);
    signatures.forEach((signature) => signatureIndex.set(signature, nextIndex));
  });
  return readings.length ? readings : null;
}

function mergeMiddleChineseReading(base, extra) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "source" || key === "sourceSystem" || key === "sourceId") {
      merged[key] = mergeReadingSourceField(merged[key], value);
      continue;
    }
    if (!merged[key]) merged[key] = value;
  }
  return merged;
}

function mergeReadingSourceField(base, extra) {
  const values = [base, extra]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .flatMap((value) => String(value).split(/\s*,\s*/))
    .filter(Boolean);
  return [...new Set(values)].join(", ");
}

function middleChineseReadingSignatures(reading) {
  const signatures = new Set();
  const raw = normalizeMiddleChineseText(reading.raw);
  if (raw) signatures.add(`raw:${raw}`);

  const rawPosition = parseMiddleChineseRawPosition(reading.raw);
  addMiddleChinesePositionSignatures(signatures, rawPosition);

  const fieldPosition = compactMiddleChinesePosition(reading);
  addMiddleChinesePositionSignatures(signatures, fieldPosition);

  const reconstruction = normalizeMiddleChineseReconstruction(reading.ipa || reading.baxter || reading.finalReconstruction);
  if (reconstruction) signatures.add(`reconstruction:${reconstruction}`);
  return [...signatures];
}

function addMiddleChinesePositionSignatures(signatures, position) {
  if (!position) return;
  signatures.add(`position:${position}`);
  const parts = position.split("|");
  if (parts.length >= 5) {
    signatures.add(`position-no-openness:${[parts[0], parts[1], parts[2], parts[4], parts[5] || ""].join("|")}`);
  }
}

function compactMiddleChinesePosition(reading) {
  const initial = stripMiddleChineseLabel(reading.initial, "母");
  const final = stripMiddleChineseLabel(reading.final, "韻");
  const division = stripMiddleChineseLabel(reading.division, "等");
  const openness = stripMiddleChineseLabel(reading.openness, "口");
  const tone = stripMiddleChineseLabel(reading.tone, "聲");
  const fanqie = normalizeMiddleChineseText(reading.fanqie);
  if (!initial || !final || !division || !tone) return "";
  return [initial, final, division, openness, tone, fanqie].join("|");
}

function parseMiddleChineseRawPosition(raw) {
  const normalized = normalizeMiddleChineseText(raw);
  const legacyMatch = normalized.match(/^(.+?)([一二三四])([開合])([平上去入])(.+)$/);
  if (legacyMatch) {
    const [, head, division, openness, tone, fanqie] = legacyMatch;
    const initial = [...head][0];
    const final = [...head].slice(1).join("");
    if (!initial || !final || !fanqie) return "";
    return [initial, final, division, openness, tone, fanqie].join("|");
  }

  const positionMatch = normalized.match(/^([幫滂並明端透定泥來知徹澄孃精清從心邪莊初崇生俟章昌常書船日見溪羣疑影曉匣云以])([開合]?)([一二三四])([ABC]?)(.+)([平上去入])$/);
  if (!positionMatch) return "";
  const [, initial, openness, division, , final, tone] = positionMatch;
  if (!initial || !final) return "";
  return [initial, final, division, openness, tone, ""].join("|");
}

function stripMiddleChineseLabel(value, suffix) {
  return normalizeMiddleChineseText(value).replace(new RegExp(`${suffix}$`), "");
}

function normalizeMiddleChineseText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/戸/g, "戶")
    .replace(/敎/g, "教");
}

function normalizeMiddleChineseReconstruction(value) {
  return normalizeMiddleChineseText(value).toLowerCase();
}

function middleChineseSources(mc) {
  const sources = ["Unicode Unihan"];
  if (mc.initial || mc.final || mc.fanqie) sources.push("Wiktionary ltc-pron");
  if (String(mc.source || "").includes("TshetUinh") || mc.gloss || mc.sourceRhyme) sources.push("TshetUinh/廣韻");
  if (String(mc.source || "").includes("WikiHan") || mc.baxter || mc.ipa) sources.push("WikiHan");
  return [...new Set(sources)];
}

const initialIpa = {
  幫母: "p-", 滂母: "pʰ-", 並母: "b-", 明母: "m-",
  端母: "t-", 透母: "tʰ-", 定母: "d-", 泥母: "n-", 來母: "l-",
  知母: "ʈ-", 徹母: "ʈʰ-", 澄母: "ɖ-", 孃母: "ɳ-", 娘母: "ɳ-",
  精母: "ts-", 清母: "tsʰ-", 從母: "dz-", 从母: "dz-", 心母: "s-", 邪母: "z-",
  莊母: "ʈʂ-", 庄母: "ʈʂ-", 初母: "ʈʂʰ-", 崇母: "ɖʐ-", 生母: "ʂ-", 俟母: "ʐ-",
  章母: "tɕ-", 昌母: "tɕʰ-", 常母: "dʑ-", 禪母: "ʑ-", 船母: "ʑ-", 書母: "ɕ-", 日母: "ȵ-",
  見母: "k-", 溪母: "kʰ-", 羣母: "ɡ-", 群母: "ɡ-", 疑母: "ŋ-",
  影母: "ʔ-", 曉母: "x-", 匣母: "ɣ-", 云母: "ɦ-/ɣ-", 雲母: "ɦ-/ɣ-", 以母: "j-",
  非母: "f-", 敷母: "fʰ-", 奉母: "v-", 微母: "ɱ-/ʋ-",
};

const finalIpa = {
  東韻: "-uwng", 屋韻: "-uwk", 冬韻: "-owng", 沃韻: "-owk", 鍾韻: "-jowng", 燭韻: "-jowk",
  江韻: "-æwng", 覺韻: "-æwk",
  支韻: "-je", 脂韻: "-ij", 之韻: "-i", 微韻: "-jɨj/-uj",
  魚韻: "-jo", 虞韻: "-ju", 模韻: "-uo",
  齊韻: "-ej", 祭韻: "-jej", 泰韻: "-aj", 佳韻: "-ɛaj", 皆韻: "-ɛj", 夬韻: "-æj", 灰韻: "-woj", 咍韻: "-oj", 廢韻: "-joj",
  眞韻: "-in", 真韻: "-in", 質韻: "-it", 諄韻: "-win", 術韻: "-wit", 臻韻: "-ɨn", 櫛韻: "-ɨt", 文韻: "-jun", 物韻: "-jut", 欣韻: "-jɨn", 迄韻: "-jɨt", 元韻: "-jon", 月韻: "-jot", 魂韻: "-won", 沒韻: "-wot", 痕韻: "-on", 麧韻: "-ot",
  寒韻: "-an", 曷韻: "-at", 桓韻: "-wan", 末韻: "-wat", 刪韻: "-æn", 鎋韻: "-æt", 山韻: "-ɛan", 黠韻: "-ɛat", 先韻: "-en", 屑韻: "-et", 仙韻: "-jen", 薛韻: "-jet",
  蕭韻: "-ew", 宵韻: "-jew", 肴韻: "-æw", 豪韻: "-aw",
  歌韻: "-a", 戈韻: "-wa", 麻韻: "-æ",
  陽韻: "-jang", 藥韻: "-jak", 唐韻: "-ang", 鐸韻: "-ak",
  庚韻: "-æng", 陌韻: "-æk", 耕韻: "-ɛng", 麥韻: "-ɛk", 清韻: "-jeng", 昔韻: "-jek", 青韻: "-eng", 錫韻: "-ek",
  蒸韻: "-ing", 職韻: "-ik", 登韻: "-ong", 德韻: "-ok",
  尤韻: "-juw", 侯韻: "-uw", 幽韻: "-jiw",
  侵韻: "-im", 緝韻: "-ip",
  覃韻: "-om", 合韻: "-op", 談韻: "-am", 盍韻: "-ap", 鹽韻: "-jem", 葉韻: "-jep", 添韻: "-em", 怗韻: "-ep", 咸韻: "-æm", 洽韻: "-æp", 銜韻: "-ɛm", 狎韻: "-ɛp", 嚴韻: "-jæm", 業韻: "-jæp", 凡韻: "-jom", 乏韻: "-jop",
};

const lmcFinalIpa = {
  微韻: "-ɨi/-ui", 廢韻: "-ɨi/-ui", 文韻: "-un", 物韻: "-ut", 元韻: "-yan/-uan", 月韻: "-yat/-uat",
  東韻: "-uŋ", 屋韻: "-uk", 冬韻: "-oŋ", 鍾韻: "-ioŋ", 燭韻: "-iok", 江韻: "-ɔŋ", 覺韻: "-ɔk",
  支韻: "-i", 脂韻: "-i", 之韻: "-ɨ", 魚韻: "-y", 虞韻: "-u", 模韻: "-u",
  齊韻: "-ei", 祭韻: "-iai", 泰韻: "-ai", 佳韻: "-ai", 皆韻: "-ai", 夬韻: "-ai/-uai", 灰韻: "-uai", 咍韻: "-ai",
  眞韻: "-in", 真韻: "-in", 質韻: "-it", 臻韻: "-in/-ən", 殷韻: "-ɨn", 寒韻: "-an", 曷韻: "-at", 桓韻: "-uan", 末韻: "-uat", 刪韻: "-an", 山韻: "-ɛn", 先韻: "-en", 屑韻: "-et", 仙韻: "-ien", 薛韻: "-iet", 魂韻: "-un", 痕韻: "-ən",
  蕭韻: "-eu", 宵韻: "-ieu", 肴韻: "-au", 豪韻: "-au", 歌韻: "-a", 戈韻: "-ua", 麻韻: "-a",
  陽韻: "-iaŋ", 藥韻: "-iak", 唐韻: "-aŋ", 鐸韻: "-ak",
  庚韻: "-iaŋ/-ɛŋ", 陌韻: "-iak/-ɛk", 耕韻: "-ɛŋ", 麥韻: "-ɛk", 清韻: "-ieŋ", 昔韻: "-iek", 青韻: "-eŋ", 錫韻: "-ek",
  蒸韻: "-iŋ", 職韻: "-ik", 登韻: "-əŋ", 德韻: "-ək", 尤韻: "-iu", 侯韻: "-əu", 幽韻: "-iu",
  侵韻: "-im", 緝韻: "-ip", 覃韻: "-əm", 合韻: "-əp", 談韻: "-am", 盍韻: "-ap", 鹽韻: "-iem", 葉韻: "-iep", 添韻: "-em", 怗韻: "-ep", 咸韻: "-am", 洽韻: "-ap", 銜韻: "-am", 狎韻: "-ap", 嚴韻: "-iam", 業韻: "-iap", 凡韻: "-uam", 乏韻: "-uap",
};

const lmcInitialIpa = {
  幫母: "p-", 滂母: "pʰ-", 並母: "pʱ-", 明母: "m-",
  非母: "f-", 敷母: "fʰ-", 奉母: "fʱ-", 微母: "ʋ-",
  端母: "t-", 透母: "tʰ-", 定母: "tʱ-", 泥母: "n-", 來母: "l-",
  知母: "ʈʂ-", 徹母: "ʈʂʰ-", 澄母: "ʈʂʱ-", 孃母: "ɳ-", 娘母: "ɳ-",
  精母: "ts-", 清母: "tsʰ-", 從母: "tsʱ-", 从母: "tsʱ-", 心母: "s-", 邪母: "sʱ-",
  莊母: "ʈʂ-", 庄母: "ʈʂ-", 初母: "ʈʂʰ-", 崇母: "ɖʐ-", 生母: "ʂ-", 俟母: "ʐ-",
  章母: "ʈʂ-", 昌母: "ʈʂʰ-", 常母: "ʈʂʱ-", 禪母: "ʂʱ-", 船母: "ʂʱ-", 書母: "ʂ-", 日母: "ʐ-",
  照母: "ʈʂ-", 穿母: "ʈʂʰ-", 牀母: "ʈʂʱ-", 審母: "ʂ-",
  見母: "k-", 溪母: "kʰ-", 羣母: "kʱ-", 群母: "kʱ-", 疑母: "ŋ-",
  影母: "ʔ-", 喩母: "j-", 喻母: "j-", 曉母: "x-", 匣母: "xʱ-", 云母: "j-", 雲母: "j-", 以母: "j-",
};

function enhanceEarlyMiddleChinese(mc) {
  const parsed = parseMiddleChineseRawFields(mc.raw);
  const initial = mc.initial || parsed.initial || "";
  const rawFinal = mc.final || parsed.final || "";
  const division = mc.division || parsed.division || "";
  const tone = mc.tone || parsed.tone || "";
  const final = normalizeMiddleChineseFinalForTone(rawFinal, tone);
  const fanqie = mc.fanqie || parsed.fanqie || "";
  const openness = middleChineseOpennessForReading({ ...mc, ...parsed, initial, final, division, tone, fanqie });
  return {
    ...mc,
    initial,
    final,
    division,
    divisionClass: mc.divisionClass || parsed.divisionClass || middleChineseDivisionClassForReading({ initial, final, division, tone, fanqie }) || (division && division !== "三等" ? "非三等" : ""),
    rhymeGroup: mc.rhymeGroup || middleChineseRhymeGroupForFinal(final) || "",
    openness,
    tone,
    fanqie,
    initialIpa: mc.initialIpa || initialIpa[initial] || "",
    finalReconstruction: mc.finalReconstruction || finalIpa[final] || "",
  };
}

function normalizeMiddleChineseFinalForTone(final, tone) {
  if (tone !== "入聲") return final;
  const enteringFinals = {
    東韻: "屋韻", 冬韻: "沃韻", 鍾韻: "燭韻", 江韻: "覺韻",
    眞韻: "質韻", 真韻: "質韻", 諄韻: "術韻", 臻韻: "櫛韻", 文韻: "物韻", 欣韻: "迄韻", 元韻: "月韻", 魂韻: "沒韻", 痕韻: "麧韻",
    寒韻: "曷韻", 桓韻: "末韻", 刪韻: "鎋韻", 山韻: "黠韻", 先韻: "屑韻", 仙韻: "薛韻",
    陽韻: "藥韻", 唐韻: "鐸韻",
    庚韻: "陌韻", 耕韻: "麥韻", 清韻: "昔韻", 青韻: "錫韻",
    蒸韻: "職韻", 登韻: "德韻",
    侵韻: "緝韻", 覃韻: "合韻", 談韻: "盍韻", 鹽韻: "葉韻", 添韻: "怗韻", 咸韻: "洽韻", 銜韻: "狎韻", 嚴韻: "業韻", 凡韻: "乏韻",
  };
  return enteringFinals[final] || final;
}

function parseMiddleChineseRawFields(raw) {
  const normalized = normalizeMiddleChineseText(raw);
  if (!normalized) return {};

  const wikiMatch = normalized.match(/^([幫滂並明端透定泥來知徹澄孃娘精清從从心邪莊庄初崇生俟章昌常書船禪日見溪羣群疑影曉匣云雲以])(.+?)([一二三四])([開合]?)\s+([平上去入])(.+)$/);
  if (wikiMatch) {
    const [, initial, final, division, openness, tone, fanqie] = wikiMatch;
    return {
      initial: `${initial}母`,
      final: `${final}韻`,
      division: `${division}等`,
      divisionClass: "",
      openness: openness ? `${openness}口` : "",
      tone: `${tone}聲`,
      fanqie,
    };
  }

  const legacyMatch = normalized.match(/^(.+?)([一二三四])([開合])([平上去入])(.+)$/);
  if (legacyMatch) {
    const [, head, division, openness, tone, fanqie] = legacyMatch;
    const initial = [...head][0];
    const final = [...head].slice(1).join("");
    if (!initial || !final || !fanqie) return {};
    return {
      initial: `${initial}母`,
      final: `${final}韻`,
      division: `${division}等`,
      divisionClass: "",
      openness: `${openness}口`,
      tone: `${tone}聲`,
      fanqie,
    };
  }

  const positionMatch = normalized.match(/^([幫滂並明端透定泥來知徹澄孃娘精清從从心邪莊庄初崇生俟章昌常書船禪日見溪羣群疑影曉匣云雲以])([開合]?)([一二三四])([ABC]?)(.+)([平上去入])$/);
  if (!positionMatch) return {};
  const [, initial, openness, division, divisionClass, final, tone] = positionMatch;
  if (!initial || !final) return {};
  return {
    initial: `${initial}母`,
    final: `${final}韻`,
    division: `${division}等`,
    divisionClass: division === "三" ? rawDivisionClassLabel(divisionClass) : "",
    openness: openness ? `${openness}口` : "",
    tone: `${tone}聲`,
  };
}

function middleChineseOpennessForReading(reading) {
  const current = normalizeMiddleChineseOpenness(reading.openness);
  if (current) return current;

  const raw = normalizeMiddleChineseText(reading.raw || "");
  const rawOpenness = raw.match(/[一二三四][ABC]?([開合])/);
  if (rawOpenness?.[1] === "開") return "開口";
  if (rawOpenness?.[1] === "合") return "合口";

  const final = String(reading.final || "").replace(/韻$/, "");
  if (middleChineseClosedOnlyFinals.has(final)) return "合口";

  const reconstruction = cleanReconstructionText(reading.finalReconstruction || reading.baxter || reading.ipa || "");
  if (/^[^aeiouəɛɨ]*w[aeiouəɛɨ]/i.test(reconstruction) && !middleChineseOpenPreferredFinals.has(final)) {
    return "合口";
  }
  return "開口";
}

function normalizeMiddleChineseOpenness(value) {
  if (value === "開口" || value === "合口") return value;
  if (value === "開") return "開口";
  if (value === "合") return "合口";
  return "";
}

const middleChineseClosedOnlyFinals = new Set(["虞", "文", "魂", "桓", "凡"]);
const middleChineseOpenPreferredFinals = new Set(["模", "戈"]);

let middleChineseRhymeGroupCache = null;
let middleChineseDivisionClassCache = null;

function middleChineseRhymeGroupForFinal(final) {
  if (!final) return "";
  if (!middleChineseRhymeGroupCache) {
    middleChineseRhymeGroupCache = new Map();
    const sources = [
      typeof ALL_MIDDLE_CHINESE_READINGS !== "undefined" ? ALL_MIDDLE_CHINESE_READINGS : null,
      typeof MIDDLE_CHINESE_READINGS !== "undefined" ? MIDDLE_CHINESE_READINGS : null,
      typeof TSHET_UINH_MIDDLE_CHINESE_READINGS !== "undefined" ? TSHET_UINH_MIDDLE_CHINESE_READINGS : null,
    ].filter(Boolean);
    for (const source of sources) {
      for (const readings of Object.values(source)) {
        for (const reading of readings) {
          if (reading.final && reading.rhymeGroup && !middleChineseRhymeGroupCache.has(reading.final)) {
            middleChineseRhymeGroupCache.set(reading.final, reading.rhymeGroup);
          }
        }
      }
    }
  }
  return middleChineseRhymeGroupCache.get(final) || "";
}

function middleChineseDivisionClassForReading(reading) {
  if (reading.division !== "三等") return "";
  if (!middleChineseDivisionClassCache) {
    const exact = new Map();
    const broad = new Map();
    const add = (map, key, value) => {
      if (!key || !value) return;
      const old = map.get(key);
      map.set(key, old && old !== value ? null : value);
    };
    const sources = [
      typeof TSHET_UINH_MIDDLE_CHINESE_READINGS !== "undefined" ? TSHET_UINH_MIDDLE_CHINESE_READINGS : null,
    ].filter(Boolean);
    for (const source of sources) {
      for (const readings of Object.values(source)) {
        for (const item of readings) {
          if (item.division !== "三等" || !item.divisionClass) continue;
          add(exact, middleChineseDivisionClassKey(item, true), item.divisionClass);
          add(broad, middleChineseDivisionClassKey(item, false), item.divisionClass);
        }
      }
    }
    middleChineseDivisionClassCache = { exact, broad };
  }
  return (
    middleChineseDivisionClassCache.exact.get(middleChineseDivisionClassKey(reading, true)) ||
    middleChineseDivisionClassCache.broad.get(middleChineseDivisionClassKey(reading, false)) ||
    ""
  );
}

function middleChineseDivisionClassKey(reading, includeFanqie) {
  const parts = [
    normalizeMiddleChineseInitialForKey(reading.initial),
    normalizeMiddleChineseText(reading.final),
    normalizeMiddleChineseText(reading.division),
    normalizeMiddleChineseText(reading.tone),
  ];
  if (parts.some((part) => !part)) return "";
  if (includeFanqie) parts.push(normalizeMiddleChineseText(reading.fanqie));
  return parts.join("|");
}

function normalizeMiddleChineseInitialForKey(initial) {
  return normalizeMiddleChineseText(initial)
    .replace(/^群/, "羣")
    .replace(/^从/, "從");
}

function deriveLateMiddleChinese(mc, sino = null) {
  const emc = enhanceEarlyMiddleChinese(mc);
  const initial = deriveLateInitial(emc, sino);
  const finalReconstruction = deriveLateFinalReconstruction(emc);
  return {
    ...emc,
    initial,
    initialIpa: lmcInitialIpa[initial] || initialIpa[initial] || emc.initialIpa,
    finalReconstruction,
    note: finalReconstruction ? lateMiddleChineseNote(emc, initial) : "만기중고한어 운모 대응값이 아직 없습니다.",
  };
}

function deriveLateFinalReconstruction(mc) {
  const value = mc.final && lmcFinalIpa[mc.final];
  if (!value) return "";
  const byInitial = preferLateFinalByInitial(value, mc);
  if (byInitial) return byInitial;
  const byGrade = preferLateFinalByGrade(value, mc);
  if (byGrade) return byGrade;
  if (mc.openness === "合口") return preferClosedLateFinal(value);
  if (mc.openness === "開口") return preferOpenLateFinal(value);
  return value;
}

function preferLateFinalByInitial(value, mc) {
  if (mc.final === "臻韻") {
    return isRetroflexSibilantInitial(mc.initial) ? "-ən" : "-in";
  }
  return "";
}

function preferLateFinalByGrade(value, mc) {
  if (mc.final === "庚韻" || mc.final === "陌韻") {
    const parts = String(value).split("/");
    if (mc.division === "二等") return parts[1] || parts[0] || value;
    if (mc.division === "三等") return parts[0] || value;
  }
  return "";
}

function preferClosedLateFinal(value) {
  const parts = String(value).split("/");
  return parts.find((part) => /u|w/.test(part)) || parts[parts.length - 1] || value;
}

function preferOpenLateFinal(value) {
  const parts = String(value).split("/");
  return parts.find((part) => !/u|w/.test(part)) || parts[0] || value;
}

function lateMiddleChineseNote(emc, initial) {
  const notes = [];
  if (initial !== emc.initial) notes.push("성모 변화 반영");
  if (isLateDentalSibilantMerger(emc.initial)) notes.push("정치음 합류 반영");
  if (emc.initial === "常母") notes.push("常母는 平聲이면 파찰음, 仄聲이면 마찰음 계열로 반영");
  if (isLateGutturalInitial(emc.initial)) notes.push("후음 변화 반영");
  if (isFullyVoicedObstruentInitial(emc.initial)) notes.push("전탁음 변화 반영");
  if (isLateGradeSplitFinal(emc.final)) notes.push("등에 따라 운모 분기");
  else if (String(lmcFinalIpa[emc.final] || "").includes("/")) notes.push("개합에 따라 운모 분기");
  return notes.length ? notes.join(", ") : "";
}

function deriveLateInitial(mc, sino = null) {
  const mergedGuttural = lateGutturalInitial(mc.initial);
  if (mergedGuttural) return mergedGuttural;

  const mergedDental = lateDentalSibilantInitial(mc);
  if (mergedDental) return mergedDental;

  if (shouldSplitLateLabiodental(mc, sino)) {
    if (mc.initial === "幫母") return "非母";
    if (mc.initial === "滂母") return "敷母";
    if (mc.initial === "並母") return "奉母";
    if (mc.initial === "明母") return "微母";
  }
  return mc.initial;
}

function lateGutturalInitial(initial) {
  const merger = {
    云母: "喩母",
    雲母: "喩母",
    以母: "喩母",
    喻母: "喩母",
  };
  return merger[initial] || "";
}

function lateDentalSibilantInitial(mc) {
  const initial = mc.initial;
  if (initial === "常母") return mc.tone === "平聲" ? "牀母" : "禪母";
  const merger = {
    莊母: "照母",
    庄母: "照母",
    章母: "照母",
    初母: "穿母",
    昌母: "穿母",
    崇母: "牀母",
    船母: "禪母",
    生母: "審母",
    書母: "審母",
    俟母: "禪母",
  };
  return merger[initial] || "";
}

function isLateDentalSibilantMerger(initial) {
  return new Set(["莊母", "庄母", "章母", "初母", "昌母", "崇母", "船母", "常母", "生母", "書母", "俟母", "禪母"]).has(initial);
}

function isLateGutturalInitial(initial) {
  return new Set(["影母", "喩母", "喻母", "云母", "雲母", "以母", "曉母", "匣母"]).has(initial);
}

function isFullyVoicedObstruentInitial(initial) {
  return new Set(["並母", "定母", "澄母", "從母", "从母", "邪母", "崇母", "俟母", "常母", "船母", "羣母", "群母", "匣母", "奉母"]).has(initial);
}

function isRetroflexSibilantInitial(initial) {
  return new Set(["莊母", "庄母", "初母", "崇母", "生母", "俟母", "照母", "穿母", "牀母", "審母", "禪母"]).has(initial);
}

function isLateGradeSplitFinal(final) {
  return new Set(["庚韻", "陌韻", "臻韻"]).has(final);
}

function shouldSplitLateLabiodental(mc, sino = null) {
  if (!["幫母", "滂母", "並母", "明母"].includes(mc.initial)) return false;
  if (mc.division !== "三等") return false;
  if (hasModernLabiodentalReading(sino)) return true;
  if (lateLabiodentalBlockedFinals.has(mc.final)) return false;
  return lateLabiodentalFinals.has(mc.final);
}

function hasModernLabiodentalReading(sino) {
  if (!sino) return false;
  return [
    sino.mandarin,
    sino.cantonese,
    sino.vietnamese,
  ].some((value) => isModernLabiodentalReading(value));
}

function isModernLabiodentalReading(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s,;/]+/)
    .filter(Boolean)
    .some((token) => /^(f|ph|v)/i.test(token));
}

const lateLabiodentalFinals = new Set([
  "東韻", "屋韻",
  "鍾韻", "燭韻",
  "虞韻",
  "微韻", "廢韻",
  "文韻", "物韻", "元韻", "月韻",
  "陽韻", "藥韻",
  "尤韻",
  "凡韻", "乏韻",
]);

const lateLabiodentalBlockedFinals = new Set([
  "歌韻", "戈韻", "麻韻",
  "咍韻", "泰韻", "灰韻", "佳韻", "皆韻", "夬韻", "齊韻", "祭韻",
  "寒韻", "曷韻", "桓韻", "末韻", "刪韻", "鎋韻", "山韻", "黠韻", "先韻", "屑韻",
  "蕭韻", "肴韻", "豪韻",
  "唐韻", "鐸韻",
  "耕韻", "麥韻", "青韻", "錫韻",
  "登韻", "德韻",
  "侯韻",
  "覃韻", "合韻", "談韻", "盍韻", "添韻", "怗韻", "咸韻", "洽韻", "銜韻", "狎韻",
]);

const compactDictionaryRows = typeof COMPACT_DICTIONARY !== "undefined" ? COMPACT_DICTIONARY : [];
const compactDictionaryRowsByChar = new Map(compactDictionaryRows.map((row) => [row[0], row]));
const compactJapaneseOnRawByChar = new Map(compactDictionaryRows.map((row) => [row[0], row[4] || ""]));
const canonicalHanOverrides = new Map([
  ["同", "同"],
  ["仝", "同"],
  ["冬", "冬"],
  ["鼕", "冬"],
  ["万", "萬"],
  ["与", "與"],
  ["会", "會"],
  ["国", "國"],
  ["学", "學"],
  ["气", "氣"],
  ["广", "廣"],
  ["体", "體"],
  ["当", "當"],
  ["党", "黨"],
  ["龙", "龍"],
  ["亀", "龜"],
  ["歯", "齒"],
  ["斉", "齊"],
  ["斎", "齋"],
  ["济", "濟"],
  ["済", "濟"],
  ["号", "號"],
  ["処", "處"],
  ["处", "處"],
  ["实", "實"],
  ["実", "實"],
  ["声", "聲"],
  ["医", "醫"],
  ["楽", "樂"],
  ["药", "藥"],
  ["薬", "藥"],
  ["译", "譯"],
  ["訳", "譯"],
  ["读", "讀"],
  ["読", "讀"],
  ["续", "續"],
  ["属", "屬"],
  ["数", "數"],
  ["说", "說"],
  ["证", "證"],
  ["观", "觀"],
  ["観", "觀"],
  ["权", "權"],
  ["経", "經"],
  ["经", "經"],
  ["轻", "輕"],
  ["軽", "輕"],
  ["县", "縣"],
  ["県", "縣"],
  ["转", "轉"],
  ["転", "轉"],
  ["传", "傳"],
  ["伝", "傳"],
  ["单", "單"],
  ["単", "單"],
  ["战", "戰"],
  ["戦", "戰"],
  ["断", "斷"],
  ["弹", "彈"],
  ["弾", "彈"],
  ["圆", "圓"],
  ["円", "圓"],
  ["园", "園"],
  ["図", "圖"],
  ["图", "圖"],
  ["听", "聽"],
  ["聴", "聽"],
  ["売", "賣"],
  ["卖", "賣"],
  ["买", "買"],
  ["贝", "貝"],
  ["员", "員"],
  ["维", "維"],
  ["杂", "雜"],
  ["雑", "雜"],
  ["双", "雙"],
  ["边", "邊"],
  ["辺", "邊"],
  ["变", "變"],
  ["変", "變"],
  ["礼", "禮"],
  ["禅", "禪"],
  ["仏", "佛"],
  ["仮", "假"],
  ["価", "價"],
  ["归", "歸"],
  ["岛", "島"],
  ["鸟", "鳥"],
  ["马", "馬"],
  ["鱼", "魚"],
  ["塩", "鹽"],
  ["黒", "黑"],
  ["点", "點"],
  ["悪", "惡"],
  ["壊", "壞"],
  ["应", "應"],
  ["応", "應"],
  ["様", "樣"],
  ["荣", "榮"],
  ["栄", "榮"],
  ["营", "營"],
  ["営", "營"],
  ["区", "區"],
  ["駆", "驅"],
  ["驱", "驅"],
  ["駅", "驛"],
  ["铁", "鐵"],
  ["鉄", "鐵"],
  ["镇", "鎮"],
  ["鉱", "鑛"],
  ["钱", "錢"],
  ["銭", "錢"],
  ["释", "釋"],
  ["釈", "釋"],
  ["隐", "隱"],
  ["隠", "隱"],
  ["随", "隨"],
  ["险", "險"],
  ["難", "難"],
  ["难", "難"],
  ["離", "離"],
  ["云", "雲"],
  ["电", "電"],
  ["顶", "頂"],
  ["项", "項"],
  ["显", "顯"],
  ["顕", "顯"],
  ["验", "驗"],
  ["験", "驗"],
  ["风", "風"],
  ["飞", "飛"],
  ["饭", "飯"],
  ["饮", "飲"],
  ["馆", "館"],
  ["髪", "髮"],
  ["闘", "鬪"],
  ["鸡", "雞"],
  ["麦", "麥"],
  ["黄", "黃"],
]);
const compactKoreanReadingIndex = buildCompactKoreanReadingIndex(compactDictionaryRows);
const koreanSearchPriorityChars = "日月火水木金土天地人中大小上下左右東西南北一二三四五六七八九十百千萬年分國學漢文王心生長行法物事社思寺史司使四士仕師私死舍射寫謝詞辭成常上尙尙城性姓省聲星世勢稅洗細歲手首受授守收樹書暑署所素少笑消昭照食息式識植直職志至知紙地持指支之";
const koreanSearchReadingPriorityByToken = {
  가: "家加可歌價街假暇佳架",
  각: "各角脚閣刻覺却殼",
  간: "間干看刊肝簡姦幹懇",
  갈: "葛渴褐竭",
  감: "感甘減監敢鑑勘",
  갑: "甲匣岬鉀",
  강: "江降講强康綱鋼剛",
  개: "開改皆個介慨槪蓋",
  객: "客",
  거: "車去居擧據巨拒距渠遽鉅鋸",
  건: "建乾健件巾鍵",
  걸: "傑乞",
  검: "劍檢儉",
  격: "格擊隔激",
  견: "見犬堅絹肩遣牽",
  결: "決結潔缺訣",
  겸: "兼謙鎌鉗",
  경: "京經敬景輕慶鏡境警",
  계: "計界繼溪季戒係契鷄",
  고: "高古告故考苦固庫孤稿",
  곡: "曲谷穀哭",
  곤: "困坤昆袞",
  골: "骨",
  공: "工公空功共供攻孔恐恭",
  과: "過果科課誇寡戈",
  곽: "郭廓",
  관: "觀官冠管關館貫寬慣棺",
  광: "光廣鑛狂",
  괘: "卦掛",
  괴: "怪壞愧槐",
  교: "交敎校橋巧郊較",
  구: "九口求救舊具句區狗久球",
  국: "國局菊鞠",
  군: "君軍郡群",
  굴: "屈窟",
  궁: "宮弓窮",
  권: "權卷勸券圈",
  귀: "貴歸鬼龜",
  규: "規叫糾奎閨",
  균: "均菌鈞",
  극: "極克劇",
  근: "近根勤謹斤",
  금: "金今禁琴錦",
  급: "急級給及",
  긍: "肯亘",
  기: "氣其期記起基技器機奇旗",
  길: "吉",
  나: "那羅拏",
  낙: "落樂洛諾絡酪烙",
  난: "難暖亂卵",
  남: "南男",
  납: "納衲",
  낭: "浪朗娘囊",
  내: "內耐乃",
  냉: "冷",
  녀: "女",
  년: "年",
  념: "念",
  녕: "寧",
  노: "老路勞露怒奴",
  녹: "鹿綠錄祿",
  논: "論",
  농: "農濃弄",
  뇌: "雷腦惱",
  누: "樓淚累",
  능: "能陵",
  니: "尼泥",
  다: "多茶",
  단: "單斷端短丹壇檀段團",
  달: "達",
  담: "談淡膽擔潭",
  답: "答踏",
  당: "堂當唐黨糖",
  대: "大代待對帶臺貸隊",
  덕: "德",
  도: "道度都圖島刀到導徒",
  독: "獨讀毒督篤",
  돈: "敦豚頓",
  돌: "突",
  동: "東同動洞童銅桐凍棟瞳冬",
  두: "頭斗豆杜",
  득: "得",
  등: "等登燈藤",
  라: "羅螺",
  락: "樂落洛絡酪烙",
  란: "蘭亂卵欄",
  람: "藍覽濫",
  랑: "郎浪朗廊",
  래: "來",
  랭: "冷",
  량: "良量兩梁涼糧",
  려: "麗旅慮勵",
  력: "力歷曆",
  련: "連蓮練鍊戀",
  렬: "列烈劣裂",
  렴: "廉斂",
  령: "令領靈嶺零",
  례: "禮例隷",
  로: "路老勞露爐",
  록: "鹿錄綠祿",
  론: "論",
  룡: "龍",
  류: "流柳留類",
  륙: "六陸",
  륜: "倫輪",
  률: "律率栗",
  릉: "陵",
  리: "里理利李離梨吏裏",
  린: "林臨隣麟",
  립: "立",
  마: "馬麻磨魔",
  막: "莫幕漠膜",
  만: "萬滿慢晩漫",
  말: "末",
  망: "望亡忘網忙",
  매: "每買賣妹梅埋",
  맥: "麥脈",
  맹: "孟猛盲盟",
  면: "面免眠綿勉",
  명: "名命明鳴銘",
  모: "母毛暮謀模貌冒",
  목: "木目牧",
  몽: "夢蒙",
  묘: "妙廟墓卯",
  무: "無武務舞茂貿",
  묵: "墨默",
  문: "文門問聞紋",
  물: "物",
  미: "美未味米微尾",
  민: "民敏憫",
  밀: "密蜜",
  박: "朴博薄泊迫拍",
  반: "半反班飯般盤返",
  발: "發髮拔",
  방: "方房放芳防訪",
  배: "白百拜杯倍配背",
  백: "白百伯",
  번: "番繁煩翻",
  벌: "伐罰",
  범: "凡犯範",
  법: "法",
  벽: "壁碧僻癖",
  변: "變邊辨辯便",
  별: "別",
  병: "病兵丙竝甁",
  보: "保報寶步補普",
  복: "福復服伏腹複",
  본: "本",
  봉: "奉逢峯蜂鳳封",
  부: "不夫父府部富浮復",
  북: "北",
  분: "分粉紛憤墳",
  불: "不佛",
  붕: "朋崩鵬",
  비: "非比悲飛費備鼻秘",
  빈: "貧賓頻",
  빙: "氷聘",
  사: "社事思寺史司使四士仕師私死舍射寫謝詞辭",
  삭: "朔削索",
  산: "山散算産酸",
  살: "殺",
  삼: "三參森",
  상: "上常商相想霜尙賞傷象",
  새: "璽",
  색: "色索塞",
  생: "生省牲甥笙",
  서: "書西序暑署徐庶瑞敍",
  석: "石昔夕席惜釋射",
  선: "先線善船鮮仙宣選禪旋",
  설: "說雪舌設",
  섬: "閃蟾纖",
  성: "成城性姓省聲星聖盛誠",
  세: "世勢稅洗細歲",
  소: "小所素少笑消昭照蘇",
  속: "速俗續束",
  손: "孫損",
  송: "松送宋訟誦",
  수: "水手首受授守收樹修數",
  숙: "宿淑熟叔肅",
  순: "順純巡旬脣",
  술: "術述",
  승: "勝承乘僧昇",
  시: "時市是始詩視示侍施",
  식: "食式識植息飾殖",
  신: "新身信神臣申辛伸",
  실: "實失室",
  심: "心深沈審尋甚",
  십: "十",
  아: "我兒阿雅亞",
  악: "樂惡岳嶽握幄渥鄂愕顎",
  안: "安案顔眼岸",
  알: "謁軋",
  암: "暗巖庵",
  압: "壓押",
  앙: "央仰殃",
  애: "愛哀崖",
  액: "厄額液",
  앵: "櫻鶯",
  야: "夜野也冶射",
  약: "藥約弱若躍",
  양: "良兩量羊陽洋養讓",
  어: "魚語御於",
  억: "億憶抑",
  언: "言彦焉",
  엄: "嚴奄",
  업: "業",
  여: "女如餘與予",
  역: "易驛役逆譯射",
  연: "然年硏煙緣演",
  열: "熱列烈悅咽",
  염: "炎染鹽念",
  엽: "葉",
  영: "永英榮迎影營",
  예: "禮例藝豫銳",
  오: "五午吾悟誤惡烏",
  옥: "玉屋獄",
  온: "溫穩",
  옹: "翁擁雍",
  와: "瓦臥",
  완: "完緩玩",
  왈: "曰",
  왕: "王往旺",
  외: "外畏",
  요: "樂要曜謠遙腰",
  욕: "欲浴辱",
  용: "用容勇龍",
  우: "雨又右友宇憂偶",
  운: "雲運韻",
  웅: "雄熊",
  원: "元原遠園願院",
  월: "月越",
  위: "位爲危偉威衛",
  유: "有由油幼遊猶柔",
  육: "六肉育陸",
  윤: "允潤尹",
  율: "律率栗",
  은: "銀恩隱",
  음: "音陰飮",
  읍: "邑泣",
  응: "應凝",
  의: "義意衣醫疑儀",
  이: "二以耳已異移",
  익: "益翼",
  인: "人仁因引忍認咽",
  일: "一日逸",
  임: "林任臨壬",
  입: "入立",
  자: "子字自者資姉慈",
  작: "作昨酌爵",
  잔: "殘盞",
  잠: "暫潛蠶",
  잡: "雜",
  장: "長張章場將掌藏",
  재: "在才材財栽再",
  쟁: "爭",
  저: "低底著貯抵",
  적: "赤的敵適積籍",
  전: "傳全典前展戰轉田電錢",
  절: "節切絶",
  점: "占店點漸",
  접: "接蝶",
  정: "正政定情精靜井",
  제: "濟製祭第題齊諸除際",
  조: "朝鳥祖助造調早",
  족: "足族",
  존: "尊存",
  종: "宗終種從鐘",
  좌: "左座坐",
  죄: "罪",
  주: "主朱注住周州酒走",
  죽: "竹粥",
  준: "準俊遵",
  중: "中重衆仲",
  즉: "卽",
  증: "曾增證蒸",
  지: "之地知至志指持紙識只",
  직: "直職織",
  진: "眞進陳盡鎭珍",
  질: "質秩疾姪",
  집: "集執",
  차: "車次差茶借叉且此",
  착: "着錯捉",
  찬: "贊撰餐",
  찰: "察札",
  참: "參慘斬",
  창: "昌唱倉創窓",
  채: "菜採彩債",
  책: "冊責策",
  처: "處妻",
  척: "尺斥戚拓",
  천: "天千川泉淺賤",
  철: "鐵徹哲撤",
  첨: "添尖瞻",
  첩: "妾牒",
  청: "靑淸請聽",
  체: "體替遞",
  초: "初草招超楚",
  촌: "村寸",
  총: "總聰銃",
  최: "最催崔",
  추: "秋追推醜抽",
  축: "祝縮畜丑",
  춘: "春",
  출: "出",
  충: "忠蟲充衝",
  취: "取吹醉就",
  측: "側測",
  치: "治齒致置値",
  칙: "則勅",
  침: "針侵沈寢",
  칭: "稱",
  쾌: "快",
  타: "他打墮",
  탁: "卓濁托",
  탄: "炭歎彈",
  탈: "脫奪",
  탐: "探貪",
  탑: "塔",
  탕: "湯蕩",
  태: "太泰態殆",
  택: "宅擇澤",
  토: "土吐討",
  통: "通統痛",
  퇴: "退堆",
  투: "投透鬪",
  특: "特",
  파: "破波派婆",
  판: "判板版販",
  팔: "八",
  패: "敗貝牌",
  팽: "彭烹",
  편: "便片篇編偏",
  평: "平評坪",
  폐: "閉廢肺",
  포: "包布抱浦捕",
  폭: "暴爆幅",
  표: "表票標",
  품: "品",
  풍: "風豊",
  피: "皮彼避疲",
  필: "必筆",
  하: "下何夏河賀",
  학: "學鶴虐",
  한: "韓漢寒恨限閑",
  할: "割",
  함: "含咸陷艦",
  합: "合盒",
  항: "港項抗恒",
  해: "海害解亥",
  핵: "核",
  행: "行幸杏",
  향: "香鄕向響",
  허: "虛許",
  헌: "憲獻軒",
  험: "險驗",
  혁: "革",
  현: "玄現賢縣顯",
  혈: "血穴",
  혐: "嫌",
  협: "協狹峽脅葉",
  형: "兄形刑衡型",
  혜: "惠慧",
  호: "好號呼湖虎戶護",
  혹: "或惑",
  혼: "婚混魂",
  홀: "忽",
  홍: "紅洪弘",
  화: "火花化華和畫話貨",
  확: "確穫擴",
  환: "還歡患環",
  활: "活滑",
  황: "黃皇荒",
  회: "會回悔晦",
  획: "畫劃獲",
  효: "孝效曉",
  후: "後厚侯",
  훈: "訓勳薰",
  훼: "毁",
  휘: "輝揮",
  휴: "休携",
  흉: "凶胸",
  흑: "黑",
  흔: "欣",
  흠: "欠欽",
  흡: "吸",
  흥: "興",
  희: "喜希戲",
};
const traditionalDisplayHomographAllowlist = new Set([..."同干于云后斗只台里余面谷卜尸几儿才采系克制別舍岳丑出合向回因困冬千女子寸小山川州工己巾弓心戈戶手支文斤方日月木水火父片牙牛犬王瓦甘生用田白皮皿目矢石示禾穴立竹米糸缶羊羽老而耳聿肉臣自至臼舌舟艮色虫血行衣見角言豆豕貝赤走足身車辛辰邑酉里金長門隹雨靑非面革韋音頁風食首香馬骨高鬼魚鳥鹿麻黃黑鼎鼓鼻齊齒龍龜"]);
const blockedSearchCandidateChars = new Set([..."卝覌尭仭"]);
const nonHeadwordMeaningPattern = /\b(?:same as|variant|ancient form|non-classical|corrupted|simplified form|old form|incorrect form|interchangeable|vulgar form)\b|Unihan 독음 데이터 기반 자동 수집/i;
const candidateHanjaHun = {
  一: "한", 二: "두", 三: "석", 四: "넉", 五: "다섯", 六: "여섯", 七: "일곱", 八: "여덟", 九: "아홉", 十: "열",
  百: "일백", 千: "일천", 萬: "일만", 日: "날", 月: "달", 火: "불", 水: "물", 木: "나무", 金: "쇠", 土: "흙",
  天: "하늘", 地: "땅", 人: "사람", 大: "큰", 小: "작을", 中: "가운데", 上: "위", 下: "아래", 左: "왼", 右: "오른",
  東: "동녘", 西: "서녘", 南: "남녘", 北: "북녘", 年: "해", 分: "나눌", 國: "나라", 學: "배울", 漢: "한수", 文: "글월",
  王: "임금", 心: "마음", 生: "날", 長: "길", 行: "다닐", 法: "법", 物: "물건", 事: "일", 社: "모일", 思: "생각",
  寺: "절", 史: "역사", 司: "맡을", 使: "하여금", 士: "선비", 仕: "섬길", 師: "스승", 私: "사사", 死: "죽을",
  軍: "군사", 君: "임금", 郡: "고을", 群: "무리", 窘: "군색할", 裙: "치마", 捃: "주울", 皸: "틀",
  車: "수레", 次: "버금", 差: "어긋날", 茶: "차", 叉: "갈래", 且: "또", 此: "이", 藉: "깔", 侘: "실의할", 嗟: "탄식할", 去: "갈", 居: "살", 擧: "들", 據: "근거",
  觀: "볼", 官: "벼슬", 冠: "갓", 管: "대롱", 關: "관계할", 館: "집", 貫: "꿸", 寬: "너그러울", 慣: "익숙할", 棺: "널",
  傳: "전할", 全: "온전", 典: "법", 前: "앞", 展: "펼", 戰: "싸움", 轉: "구를", 田: "밭", 電: "번개", 錢: "돈",
  濟: "건널", 製: "지을", 祭: "제사", 第: "차례", 題: "제목", 齊: "가지런할", 諸: "모두", 除: "덜", 際: "즈음",
  同: "한가지", 動: "움직일", 洞: "골", 童: "아이", 銅: "구리", 桐: "오동", 凍: "얼", 棟: "마룻대", 瞳: "눈동자",
  樂: "즐길", 落: "떨어질", 洛: "물이름", 絡: "이을", 酪: "쇠젖", 烙: "지질", 惡: "악할", 嶽: "큰산", 握: "쥘",
  幄: "장막", 渥: "두터울", 鄂: "땅이름", 愕: "놀랄", 顎: "턱", 堊: "흰흙", 鍔: "칼날", 鰐: "악어",
  靑: "푸를", 淸: "맑을", 請: "청할", 聽: "들을", 葉: "잎", 省: "살필", 聲: "소리", 星: "별", 成: "이룰",
  政: "정사", 夫: "지아비", 父: "아비", 浮: "뜰", 灣: "물굽이", 場: "마당", 尙: "오히려", 賞: "상줄",
};
const eagerDictionaryIndex = typeof DICTIONARY !== "undefined"
  ? new Map(DICTIONARY.map((entry) => [entry.char, entry]))
  : null;
const expandedDictionaryEntryCache = new Map();
const deferredDataScripts = [
  "./middle-chinese.js",
  "./tshet-uinh-middle-chinese.js",
  "./wikihan-middle-chinese.js",
  "./japanese-readings.js",
];
let deferredDataLoadPromise = null;

function lookupEntry(char) {
  const normalized = char.normalize("NFKC");
  if (normalized && normalized !== char) {
    const normalizedEntry = lookupEntry(normalized);
    if (normalizedEntry) return normalizedEntry;
  }
  const canonical = canonicalHanOverrides.get(char);
  if (canonical) return dictionaryEntryForChar(canonical);
  for (const candidate of hanTraditionalSearchCandidates(char)) {
    const entry = dictionaryEntryForChar(candidate);
    if (entry) return entry;
  }
  return null;
}

function dictionaryEntryForChar(char) {
  if (eagerDictionaryIndex) return eagerDictionaryIndex.get(char) || null;
  if (expandedDictionaryEntryCache.has(char)) return expandedDictionaryEntryCache.get(char);
  const row = compactDictionaryRowsByChar.get(char);
  if (!row) return null;
  const entry = expandCompactDictionaryRow(row);
  expandedDictionaryEntryCache.set(char, entry);
  return entry;
}

function buildCompactKoreanReadingIndex(rows) {
  const index = new Map();
  rows.forEach((row) => {
    const char = canonicalDictionaryChar(row[0]);
    koreanReadingsForSearchIndex(char, row[5]).forEach((token) => {
      const list = index.get(token) || [];
      list.push(char);
      index.set(token, list);
    });
  });
  return index;
}

function koreanReadingsForSearchIndex(char, rawKorean) {
  const readings = new Set(splitSearchTokens(koreanToHangul(rawKorean || "")));
  const curated = curatedReadingMapForChar(curatedReadingSino, char);
  for (const value of Object.values(curated || {})) {
    splitSearchTokens(koreanToHangul(value?.korean || "")).forEach((token) => readings.add(token));
  }
  [...readings].forEach((token) => koreanInitialLawAliases(token).forEach((alias) => readings.add(alias)));
  return [...readings];
}

function koreanInitialLawAliases(token) {
  const aliases = new Set();
  const text = String(token || "").normalize("NFC");
  if (!text) return [];
  const chars = [...text];
  const first = chars[0];
  const rest = chars.slice(1).join("");
  const map = {
    라: "나", 래: "내", 랭: "냉", 냉: "랭", 로: "노", 뢰: "뇌", 뇨: "요", 료: "요",
    루: "누", 류: "유", 뉴: "유", 륙: "육", 뉵: "육", 륜: "윤", 뉸: "윤",
    률: "율", 뉼: "율", 륭: "융", 늉: "융", 륵: "늑", 름: "늠", 릉: "능",
    리: "이", 니: "이", 린: "인", 닌: "인", 림: "임", 님: "임", 립: "입", 닙: "입",
    룡: "용", 뇽: "용", 려: "여", 녀: "여", 력: "역", 녁: "역", 련: "연", 년: "연",
    렬: "열", 녈: "열", 렴: "염", 념: "염", 렵: "엽", 녑: "엽", 령: "영", 녕: "영",
    례: "예", 녜: "예",
  };
  if (map[first]) aliases.add(`${map[first]}${rest}`);
  if (first === "녀") aliases.add(`여${rest}`);
  if (first === "뇨" || first === "료") aliases.add(`요${rest}`);
  if (first === "뉴" || first === "류") aliases.add(`유${rest}`);
  if (first === "니" || first === "리") aliases.add(`이${rest}`);
  return [...aliases].filter((alias) => alias && alias !== text);
}

function koreanReadingSearchEquivalents(token) {
  return uniqueValues([token, ...koreanInitialLawAliases(token)]);
}

function canonicalDictionaryChar(char) {
  const normalized = char.normalize("NFKC");
  if (normalized && normalized !== char) {
    if (canonicalHanOverrides.has(normalized)) return canonicalHanOverrides.get(normalized);
    if (compactDictionaryRowsByChar.has(normalized)) return normalized;
    for (const candidate of hanTraditionalSearchCandidates(normalized)) {
      if (canonicalHanOverrides.has(candidate)) return canonicalHanOverrides.get(candidate);
      if (compactDictionaryRowsByChar.has(candidate)) return candidate;
    }
  }
  if (canonicalHanOverrides.has(char)) return canonicalHanOverrides.get(char);
  for (const candidate of hanTraditionalSearchCandidates(char)) {
    if (canonicalHanOverrides.has(candidate)) return canonicalHanOverrides.get(candidate);
    if (compactDictionaryRowsByChar.has(candidate)) return candidate;
  }
  return char;
}

function loadDeferredDictionaryData() {
  if (!deferredDataLoadPromise) {
    deferredDataLoadPromise = Promise.all(deferredDataScripts.map(loadScriptOnce));
  }
  return deferredDataLoadPromise;
}

function loadScriptOnce(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  if (existing?.dataset.loading === "true") {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.dataset.loading = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`데이터 파일을 불러오지 못했습니다: ${src}`));
    document.head.append(script);
  });
}

function japaneseOnToKatakana(value) {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(romanToKatakana)
    .join(" ");
}

function romanToKatakana(token) {
  let text = token
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ō/g, "OU")
    .replace(/Ū/g, "UU")
    .replace(/Ā/g, "AA")
    .replace(/Ī/g, "II")
    .replace(/Ē/g, "EE");

  const syllables = {
    KYA: "キャ", KYU: "キュ", KYO: "キョ",
    GYA: "ギャ", GYU: "ギュ", GYO: "ギョ",
    SHA: "シャ", SHU: "シュ", SHO: "ショ",
    SHYA: "シャ", SHYU: "シュ", SHYO: "ショ",
    SYA: "シャ", SYU: "シュ", SYO: "ショ",
    JA: "ジャ", JU: "ジュ", JO: "ジョ",
    JYA: "ジャ", JYU: "ジュ", JYO: "ジョ",
    CHA: "チャ", CHU: "チュ", CHO: "チョ",
    CHYA: "チャ", CHYU: "チュ", CHYO: "チョ",
    TYA: "チャ", TYU: "チュ", TYO: "チョ",
    NYA: "ニャ", NYU: "ニュ", NYO: "ニョ",
    HYA: "ヒャ", HYU: "ヒュ", HYO: "ヒョ",
    BYA: "ビャ", BYU: "ビュ", BYO: "ビョ",
    PYA: "ピャ", PYU: "ピュ", PYO: "ピョ",
    MYA: "ミャ", MYU: "ミュ", MYO: "ミョ",
    RYA: "リャ", RYU: "リュ", RYO: "リョ",
    KA: "カ", KI: "キ", KU: "ク", KE: "ケ", KO: "コ",
    GA: "ガ", GI: "ギ", GU: "グ", GE: "ゲ", GO: "ゴ",
    SA: "サ", SI: "シ", SHI: "シ", SU: "ス", SE: "セ", SO: "ソ",
    ZA: "ザ", ZI: "ジ", JI: "ジ", ZU: "ズ", ZE: "ゼ", ZO: "ゾ",
    TA: "タ", TI: "チ", CHI: "チ", TU: "ツ", TSU: "ツ", TE: "テ", TO: "ト",
    DA: "ダ", DI: "ジ", DU: "ズ", DE: "デ", DO: "ド",
    NA: "ナ", NI: "ニ", NU: "ヌ", NE: "ネ", NO: "ノ",
    HA: "ハ", HI: "ヒ", HU: "フ", FU: "フ", HE: "ヘ", HO: "ホ",
    BA: "バ", BI: "ビ", BU: "ブ", BE: "ベ", BO: "ボ",
    PA: "パ", PI: "ピ", PU: "プ", PE: "ペ", PO: "ポ",
    MA: "マ", MI: "ミ", MU: "ム", ME: "メ", MO: "モ",
    YA: "ヤ", YU: "ユ", YO: "ヨ",
    RA: "ラ", RI: "リ", RU: "ル", RE: "レ", RO: "ロ",
    WA: "ワ", WI: "ヰ", WE: "ヱ", WO: "ヲ",
    A: "ア", I: "イ", U: "ウ", E: "エ", O: "オ", N: "ン",
  };

  let out = "";
  while (text.length) {
    let matched = false;
    for (const size of [4, 3, 2, 1]) {
      const chunk = text.slice(0, size);
      if (syllables[chunk]) {
        out += syllables[chunk];
        text = text.slice(size);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[0];
      text = text.slice(1);
    }
  }
  return out;
}

function koreanToHangul(value) {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(koreanTokenToHangul)
    .join(" ");
}

function koreanTokenToHangul(token) {
  const raw = token.toUpperCase();
  if (/[\uAC00-\uD7A3]/.test(raw)) return token;
  const overrides = { KKUT: "끝" };
  if (overrides[raw]) return overrides[raw];

  const choseong = {
    "": 11, K: 0, G: 0, KK: 1, N: 2, T: 3, D: 3, TT: 4, L: 5, R: 5, M: 6, P: 7, B: 7,
    PP: 8, S: 9, SS: 10, C: 12, J: 12, CC: 13, JJ: 13, CH: 14, KH: 15, TH: 16, PH: 17, H: 18,
  };
  const jungseong = {
    YAY: 3, YAE: 3, YA: 2, YEY: 7, YE: 6, YEO: 6, YO: 12, YU: 17,
    WAY: 10, WAE: 10, WEY: 15, WE: 14, WI: 16, WA: 9, WO: 14, WU: 13,
    OY: 11, UY: 19,
    AY: 1, AE: 1, EY: 5, EI: 5, EO: 4,
    A: 0, E: 4, O: 8, U: 18, I: 20,
  };
  const jongseong = { "": 0, K: 1, N: 4, T: 7, L: 8, M: 16, P: 17, S: 19, SS: 20, NG: 21, C: 22 };
  const initials = ["CH", "KH", "TH", "PH", "KK", "TT", "PP", "SS", "CC", "JJ", "K", "G", "N", "T", "D", "L", "R", "M", "P", "B", "S", "C", "J", "H", ""];
  const finals = ["NG", "SS", "K", "N", "T", "L", "M", "P", "S", "C", ""];
  const vowels = Object.keys(jungseong).sort((a, b) => b.length - a.length);

  for (const initial of initials) {
    if (!raw.startsWith(initial)) continue;
    const afterInitial = raw.slice(initial.length);
    for (const final of finals) {
      if (final && !afterInitial.endsWith(final)) continue;
      const vowel = final ? afterInitial.slice(0, -final.length) : afterInitial;
      if (!vowels.includes(vowel)) continue;
      const code = 0xac00 + (choseong[initial] * 21 + jungseong[vowel]) * 28 + jongseong[final];
      return String.fromCharCode(code);
    }
  }
  return token;
}

const fields = [
  ["성모", "initial"],
  ["성모 IPA", "initialIpa"],
  ["운", "final"],
  ["재구 운모", "finalReconstruction"],
  ["등", "division"],
  ["3등 세분", "divisionClass"],
  ["섭", "rhymeGroup"],
  ["개합", "openness"],
  ["성조", "tone"],
];

const sinoFields = [
  ["중국 간체", "chineseDisplayChar"],
  ["표준중국어", "mandarin"],
  ["광동어", "cantonese"],
  ["일본 신자체", "japaneseDisplayChar"],
  ["일본 오음", "japaneseGo"],
  ["일본 한음", "japaneseKan"],
  ["일본 관용음", "japaneseKanyo"],
  ["한국 한자음", "korean"],
  ["베트남 한자음", "vietnamese"],
];

const queryInput = document.querySelector("#query");
const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const entryTemplate = document.querySelector("#entry-template");
const readingTemplate = document.querySelector("#reading-template");

function fieldRow(label, value, key, data) {
  const row = document.createElement("div");
  row.className = "field";
  if (key) row.dataset.key = key;
  row.innerHTML = `<span class="label"></span><span class="value"></span>`;
  row.querySelector(".label").textContent = label;
  const valueNode = row.querySelector(".value");
  if (isJapaneseReadingKey(key)) {
    appendJapaneseReadingValue(valueNode, value, popularJapaneseOnSet(data));
  } else {
    valueNode.textContent = formatValue(value, key, data);
  }
  return row;
}

function formatValue(value, key, data) {
  if (!value) return "—";
  if (typeof value === "object") {
    const modern = value.modernKana || "";
    const historical = normalizeHistoricalKana(value.historicalKana || "");
    if (modern && historical) return `${modern} / ${historical}`;
    return modern || historical || "—";
  }
  if (data && key) return formatMiddleChineseValue(key, value, data);
  return value;
}

function normalizeHistoricalKana(value) {
  return String(value || "").replace(/[ァィゥェォッャュョヮ]/g, (kana) => ({
    ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ",
    ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ",
  })[kana] || kana);
}

function isJapaneseReadingKey(key) {
  return key === "japaneseGo" || key === "japaneseKan" || key === "japaneseKanyo";
}

function popularJapaneseOnSet(data) {
  const allowed = allowedJapaneseOnSet(data?.popularJapaneseOnKana || "");
  const popular = new Set(
    [
      firstJapaneseModernReading(data?.japaneseGo),
      firstJapaneseModernReading(data?.japaneseKan),
    ].filter((token) => token && (!allowed.size || allowed.has(token))),
  );
  const kanyoTokens = splitJapaneseReadingTokens(data?.japaneseKanyo?.modernKana)
    .filter((token) => token && (!allowed.size || allowed.has(token)));
  if (!popular.size) {
    kanyoTokens.forEach((token) => popular.add(token));
  } else {
    kanyoTokens
      .filter((token) => token.includes("\u30c3"))
      .forEach((token) => popular.add(token));
  }
  if (!popular.size) splitJapaneseReadingTokens(data?.popularJapaneseOnKana)[0] && popular.add(splitJapaneseReadingTokens(data?.popularJapaneseOnKana)[0]);
  return popular;
}

function firstJapaneseModernReading(value) {
  return splitJapaneseReadingTokens(value?.modernKana)[0] || "";
}

function splitJapaneseReadingTokens(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function appendJapaneseReadingValue(node, value, popularReadings) {
  const modernTokens = splitJapaneseReadingTokens(value?.modernKana);
  const historical = normalizeHistoricalKana(value?.historicalKana || "");
  if (!modernTokens.length && !historical) {
    node.textContent = "—";
    return;
  }

  modernTokens.forEach((token, index) => {
    if (index) node.append(", ");
    const span = document.createElement("span");
    span.textContent = token;
    if (popularReadings?.has(token)) span.className = "popular-reading";
    node.append(span);
  });

  if (historical) {
    if (modernTokens.length) node.append(" / ");
    node.append(splitJapaneseReadingTokens(historical).join(", "));
  }
}

function formatMiddleChineseValue(key, value, data) {
  const text = String(value);
  if (key === "initial") return replaceFinalLabel(normalizeDisplayHan(text), "母", "모");
  if (key === "final") return replaceFinalLabel(text, "韻", "운");
  if (key === "division") return formatDivision(text);
  if (key === "divisionClass") return formatDivisionClass(text);
  if (key === "rhymeGroup") return replaceFinalLabel(text, "攝", "섭");
  if (key === "openness") return formatOpenness(text);
  if (key === "tone") return formatTone(text);
  if (key === "initialIpa") return cleanPhoneticText(text);
  if (key === "finalReconstruction") return formatFinalReconstruction(text, data);
  return text;
}

function normalizeDisplayHan(value) {
  return value.replace(/羣/g, "群");
}

function replaceFinalLabel(value, sourceSuffix, targetSuffix) {
  return value.endsWith(sourceSuffix) ? `${value.slice(0, -sourceSuffix.length)}${targetSuffix}` : value;
}

function formatDivision(value) {
  const numerals = { 一: "1", 二: "2", 三: "3", 四: "4" };
  return value.replace(/^([一二三四])等$/, (_, number) => `${numerals[number]}등`);
}

function formatDivisionClass(value) {
  const labels = {
    重紐A: "중뉴A",
    重紐B: "중뉴B",
    假三等: "가3등",
    純三等: "순3등",
    三等: "3등",
    A: "중뉴A",
    B: "중뉴B",
    C: "순3등(C류)",
    無類: "일반 3등",
    非三等: "해당 없음",
  };
  return labels[value] || value;
}

function rawDivisionClassLabel(value) {
  const labels = { A: "重紐A", B: "重紐B", C: "純三等" };
  return labels[value] || "";
}

function formatOpenness(value) {
  const labels = { 開口: "개구", 合口: "합구", 開合中立: "개구" };
  return labels[value] || value;
}

function formatTone(value) {
  const labels = { 平聲: "평성", 上聲: "상성", 去聲: "거성", 入聲: "입성" };
  return labels[value] || value;
}

function formatFinalReconstruction(value, data) {
  const cleaned = cleanReconstructionText(value);
  if (!cleaned) return "—";
  const withoutTone = stripReconstructionTone(cleaned);
  if (withoutTone.startsWith("-")) return withoutTone;
  const final = stripReconstructionInitial(withoutTone, data);
  return final ? `-${final}` : `-${withoutTone}`;
}

function stripReconstructionInitial(value, data) {
  const prefixes = reconstructionInitialPrefixes(data);
  for (const prefix of prefixes.sort((a, b) => b.length - a.length)) {
    if (prefix && value.startsWith(prefix) && value.length > prefix.length) {
      return value.slice(prefix.length);
    }
  }
  return stripLikelyReconstructionInitial(value);
}

function cleanReconstructionText(value) {
  return cleanPhoneticText(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[歌]/g, "ʰ")
    .replace(/[袈]/g, "")
    .replace(/[]/g, "")
    .replace(/\+/g, "ɨ")
    .replace(/[흯]/g, "ŋ")
    .replace(/ng/g, "ŋ")
    .replace(/[챈]/g, "ae");
}

function cleanPhoneticText(value) {
  return String(value || "")
    .replace(/ʰ/g, "\uE101")
    .replace(/ʱ/g, "\uE102")
    .normalize("NFKC")
    .replace(/\uE101/g, "ʰ")
    .replace(/\uE102/g, "ʱ")
    .replace(/[͜͡]/g, "");
}

function stripReconstructionTone(value) {
  return value
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, "")
    .replace(/[0-9]+$/u, "")
    .replace(/[XH]+$/u, "");
}

function stripLikelyReconstructionInitial(value) {
  const commonPrefixes = [
    "ʈʂʰ", "tɕʰ", "tsʰ", "pʰ", "tʰ", "kʰ",
    "tʃʰ", "ʈʂ", "ɖʐ", "tɕ", "dʑ", "ȵʑ", "tʃ", "dʒ",
    "tsrh", "tsh", "dzr", "tsr", "trh", "tsyh",
    "dzy", "tsy", "kh", "ph", "th", "ng",
    "tr", "ts", "dz", "ny", "hj",
    "ʂ", "ʐ", "ɕ", "ʑ", "ʃ", "ʒ", "ɳ", "ȵ", "ɲ", "ɖ", "ʈ", "ɣ", "ɦ",
    "p", "b", "m", "t", "d", "n", "l", "s", "z",
    "k", "g", "x", "h", "y", "j", "ʔ", "ŋ",
  ];
  for (const prefix of commonPrefixes.sort((a, b) => b.length - a.length)) {
    if (value.startsWith(prefix) && value.length > prefix.length) return value.slice(prefix.length);
  }
  return value;
}

function reconstructionInitialPrefixes(data) {
  const prefixes = new Set();
  const initialIpa = cleanPhoneticText(data.initialIpa || "").replace(/-$/, "");
  if (initialIpa) prefixes.add(initialIpa);

  const initial = String(data.initial || "").replace(/母$/, "");
  const byInitial = {
    幫: ["p"], 滂: ["ph", "pʰ"], 並: ["b"], 明: ["m"],
    端: ["t"], 透: ["th", "tʰ"], 定: ["d"], 泥: ["n"], 來: ["l"],
    知: ["tr", "ʈ"], 徹: ["trh", "trʰ", "ʈʰ"], 澄: ["dr", "ɖ"], 孃: ["nr", "ɳ"],
    精: ["ts", "t͡s", "t͜s"], 清: ["tsh", "tsʰ", "t͡sʰ", "t͜sʰ"], 從: ["dz", "d͡z", "d͜z"], 心: ["s"], 邪: ["z"],
    莊: ["tsr", "ʈʂ", "t͡ʂ", "t͜ʂ", "tʃ"], 初: ["tsrh", "tsrʰ", "ʈʂʰ", "t͡ʂʰ", "t͜ʂʰ", "tʃʰ"], 崇: ["dzr", "ɖʐ", "d͡ʐ", "d͜ʐ", "dʒ"], 生: ["sr", "ʂ", "ʃ"], 俟: ["zr", "ʐ", "ʒ"],
    章: ["tsy", "tsj", "tɕ", "t͡ɕ", "t͜ɕ", "tʃ"], 昌: ["tsyh", "tɕʰ", "t͡ɕʰ", "t͜ɕʰ", "tʃʰ"], 常: ["dzy", "dʑ", "d͡ʑ", "d͜ʑ", "dʒ"], 書: ["sy", "ɕ", "ʃ"], 船: ["zy", "ʑ", "ʒ"], 日: ["ny", "ȵ", "ȵʑ", "ɲ"],
    見: ["k"], 溪: ["kh", "kʰ"], 羣: ["g"], 群: ["g"], 疑: ["ng", "ŋ"],
    影: ["'", "ʔ"], 曉: ["x", "h"], 匣: ["h", "ɣ"], 云: ["hj", "ɦ"], 以: ["y", "j"],
  };
  (byInitial[initial] || []).forEach((prefix) => prefixes.add(cleanPhoneticText(prefix)));
  return [...prefixes];
}

function fillPhonologyCard(card, title, data) {
  data = data || {};
  card.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);
  fields
    .filter(([, key]) => shouldShowMiddleChineseField(key, data))
    .forEach(([label, key]) => card.append(fieldRow(label, data[key], key, data)));
}

function shouldShowMiddleChineseField(key, data) {
  if (key !== "divisionClass") return true;
  return data.division === "三等" && data.divisionClass && data.divisionClass !== "非三等";
}

function fillSinoCard(card, data) {
  card.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "현대·주변 한자음";
  card.append(heading);
  sinoFields
    .filter(([, key]) => shouldShowSinoField(key, data))
    .forEach(([label, key]) => card.append(fieldRow(label, data[key], key, data)));
}

function shouldShowSinoField(key, data) {
  if (key === "chineseDisplayChar" || key === "japaneseDisplayChar") return Boolean(data[key]);
  return true;
}

function renderEntry(entry) {
  return renderFilteredEntry(entry, null);
}

function renderFilteredEntry(entry, readingPredicate, readingTransform = null) {
  const rawReadings = readingPredicate
    ? entry.readings.filter(readingPredicate).map((reading) => readingTransform ? readingTransform(reading) : reading)
    : entry.readings;
  const readings = dedupeVisibleReadings(rawReadings);
  const visibleEntry = {
    ...entry,
    readings,
  };
  const node = entryTemplate.content.cloneNode(true);
  node.querySelector(".char").textContent = visibleEntry.char;
  node.querySelector(".meaning").textContent = visibleEntry.meaning;
  const list = node.querySelector(".reading-list");

  visibleEntry.readings.forEach((reading, position) => {
    const readingNode = readingTemplate.content.cloneNode(true);
    readingNode.querySelector(".reading-title").textContent =
      visibleEntry.readings.length > 1 ? `${position + 1}. ${reading.label}` : reading.label;
    if (reading.meaning) {
      const meaning = document.createElement("p");
      meaning.className = "reading-meaning";
      meaning.textContent = reading.meaning;
      readingNode.querySelector(".reading-title").after(meaning);
    }
    fillPhonologyCard(readingNode.querySelector(".early"), "초기중고한어", reading.emc);
    fillPhonologyCard(readingNode.querySelector(".late"), "만기중고한어", reading.lmc);
    fillSinoCard(readingNode.querySelector(".sino"), reading.sino);
    list.append(readingNode);
  });

  return node;
}

function dedupeVisibleReadings(readings) {
  const seen = new Set();
  return readings.filter((reading) => {
    const key = visibleReadingDuplicateKey(reading);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visibleReadingDuplicateKey(reading) {
  const korean = normalizeDuplicateText(reading?.sino?.korean);
  const meaning = normalizeDuplicateText(reading?.meaning);
  if (!korean || !meaning) return "";
  return [
    korean,
    meaning,
    normalizeDuplicateText(reading?.sino?.vietnamese),
    normalizeDuplicateText(reading?.sino?.mandarin),
    normalizeDuplicateText(reading?.sino?.cantonese),
  ].join("|");
}

function normalizeDuplicateText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\s*\(.*?검토 필요.*?\)\s*/g, "")
    .replace(/[.。]+$/g, "")
    .trim();
}

function uniqueHanCharacters(text) {
  return [...new Set([...text].filter((char) => /\p{Script=Han}/u.test(char)))];
}

async function search(text) {
  const normalizedText = text.trim().normalize("NFKC");
  const chars = uniqueHanCharacters(normalizedText);
  results.innerHTML = "";

  if (!normalizedText) {
    status.textContent = "검색할 한자를 입력해주세요.";
    return;
  }

  if (!chars.length && hasHangulSyllable(normalizedText)) {
    renderKoreanReadingSearch(normalizedText);
    return;
  }

  status.textContent = "음운 데이터를 불러오는 중입니다...";
  try {
    await loadDeferredDictionaryData();
  } catch (error) {
    status.textContent = error?.message || "음운 데이터를 불러오지 못했습니다.";
    return;
  }

  const found = [];
  const missing = [];
  chars.forEach((char) => {
    const entry = lookupEntry(char);
    if (entry) found.push(entry);
    else missing.push(char);
  });

  found.forEach((entry) => results.append(renderEntry(entry)));
  const foundText = `${found.length}개 글자를 찾았습니다.`;
  const missingText = missing.length
    ? ` 아직 데이터가 없는 글자: ${missing.join(", ")}`
    : "";
  status.textContent = foundText + missingText;
}

function hasHangulSyllable(text) {
  return /[가-힣]/.test(text);
}

function splitSearchTokens(text) {
  return String(text || "")
    .normalize("NFKC")
    .split(/[\s,;；、/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function renderKoreanReadingSearch(text) {
  const tokens = splitSearchTokens(text).filter((token) => /^[가-힣]+$/.test(token));
  const candidates = koreanSearchCandidatesForTokens(tokens);
  if (!candidates.length) {
    status.textContent = `한국 한자음 "${tokens.join(", ")}"에 해당하는 후보를 찾지 못했습니다.`;
    return;
  }
  status.textContent = `한국 한자음 "${tokens.join(", ")}" 후보 ${candidates.length}개를 찾았습니다.`;
  results.append(renderCandidatePicker(candidates, tokens));
}

function koreanSearchCandidatesForTokens(tokens) {
  return sortKoreanReadingCandidates(uniqueValues(
    tokens
      .flatMap((token) => compactKoreanReadingIndex.get(token) || [])
      .map((char) => canonicalDictionaryChar(char))
      .map((char) => preferredSearchCandidateChar(char))
      .filter((char) => compactDictionaryRowsByChar.has(char)),
  ), tokens).filter(isPreferredSearchCandidateChar);
}

function sortKoreanReadingCandidates(chars, tokens = []) {
  return [...chars].sort((a, b) => {
    const ar = koreanReadingPriorityIndex(a, tokens);
    const br = koreanReadingPriorityIndex(b, tokens);
    if (ar !== br) return ar - br;
    const ap = globalKoreanPriorityIndex(a);
    const bp = globalKoreanPriorityIndex(b);
    if (ap !== bp) return ap - bp;
    return a.localeCompare(b, "ko");
  });
}

function koreanReadingPriorityIndex(char, tokens) {
  let best = Infinity;
  tokens.forEach((token) => {
    const priorityChars = koreanSearchReadingPriorityByToken[token];
    if (!priorityChars) return;
    const index = priorityChars.indexOf(char);
    if (index !== -1) best = Math.min(best, index);
  });
  return best;
}

function globalKoreanPriorityIndex(char) {
  const index = koreanSearchPriorityChars.indexOf(char);
  return index === -1 ? Infinity : index;
}

function preferredSearchCandidateChar(char, seen = new Set()) {
  if (seen.has(char)) return char;
  seen.add(char);
  const normalized = char.normalize("NFKC");
  if (normalized && normalized !== char) return preferredSearchCandidateChar(normalized, seen);
  const canonical = canonicalHanOverrides.get(char);
  if (canonical && canonical !== char) return preferredSearchCandidateChar(canonical, seen);
  const displaySource = hanDisplayFormSourcesForChar(char)
    .find((source) => source !== char && compactDictionaryRowsByChar.has(source));
  if (displaySource) return preferredSearchCandidateChar(displaySource, seen);
  const variantSource = hanReverseVariantsForChar(char)
    .find((source) => source !== char && compactDictionaryRowsByChar.has(source));
  if (variantSource) return preferredSearchCandidateChar(variantSource, seen);
  return char;
}

function isPreferredSearchCandidateChar(char) {
  if (!char || char.normalize("NFKC") !== char) return false;
  if (blockedSearchCandidateChars.has(char)) return false;
  const canonical = canonicalHanOverrides.get(char);
  if (canonical && canonical !== char) return false;
  const displaySources = hanDisplayFormSourcesForChar(char).filter((source) => source !== char);
  if (displaySources.length && !traditionalDisplayHomographAllowlist.has(char)) return false;
  const row = compactDictionaryRowsByChar.get(char);
  if (row && nonHeadwordMeaningPattern.test(row[1] || "")) return false;
  return preferredSearchCandidateChar(char) === char;
}

function renderCandidatePicker(chars, tokens) {
  const panel = document.createElement("section");
  panel.className = "candidate-panel panel";
  const heading = document.createElement("h2");
  heading.textContent = `${tokens.join(", ")} 후보`;
  panel.append(heading);

  const list = document.createElement("div");
  list.className = "candidate-list";
  chars.forEach((char) => {
    const row = compactDictionaryRowsByChar.get(char);
    const meta = candidateKoreanMeta(char, tokens, row);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `candidate-button ${candidateMetaSizeClass(meta)}`;
    button.innerHTML = `<span class="candidate-char">${char}</span><span class="candidate-meta">${escapeHtml(meta)}</span>`;
    button.addEventListener("click", () => showCandidateEntry(char, tokens));
    list.append(button);
  });
  panel.append(list);
  return panel;
}

function candidateKoreanMeta(char, tokens, row) {
  const direct = matchingKoreanReadingTokens(row?.[5] || "", tokens);
  const reading = direct.length ? displayKoreanReadingTokens(direct, tokens).join(" ") : "";
  if (reading) return candidateHunReadingMeta(char, reading);
  const curated = curatedReadingMapForChar(curatedReadingSino, char);
  const matched = Object.values(curated || {})
    .flatMap((value) => matchingKoreanReadingTokens(value?.korean || "", tokens));
  const curatedReading = displayKoreanReadingTokens(matched, tokens).join(" ") || tokens.join(" ");
  return candidateHunReadingMeta(char, curatedReading);
}

function displayKoreanReadingTokens(matched, searchedTokens) {
  const searched = searchedTokens.filter(Boolean);
  const values = matched.map((reading) => {
    const exact = searched.find((token) => token === reading);
    if (exact) return exact;
    const alias = koreanInitialLawAliases(reading).find((item) => searched.includes(item));
    return alias || reading;
  });
  return uniqueValues(values);
}

function candidateMetaSizeClass(meta) {
  const length = [...String(meta || "")].length;
  if (length >= 10) return "meta-tiny";
  if (length >= 8) return "meta-dense";
  if (length >= 6) return "meta-compact";
  return "";
}

function candidateHunReadingMeta(char, reading) {
  const hun = cleanHunValue(koreanHunForCandidate(char, reading)
    || candidateHanjaHun[char]
    || inferCandidateHunFromMeaning(compactDictionaryRowsByChar.get(char)?.[1] || ""), reading);
  return [hun, reading].filter(Boolean).join(" ") || reading;
}

function koreanHunForCandidate(char, reading) {
  const hunMap = typeof KOREAN_HUN !== "undefined" ? KOREAN_HUN[char] : null;
  if (!hunMap) return "";
  const readings = splitSearchTokens(reading);
  for (const token of readings) {
    if (hunMap[token]) return hunMap[token];
  }
  return Object.values(hunMap).find(Boolean) || "";
}

function inferCandidateHunFromMeaning(meaning) {
  const text = String(meaning || "");
  if (!text || nonHeadwordMeaningPattern.test(text)) return "";
  const first = text
    .replace(/\([^)]*\)/g, " ")
    .split(/[;,]/)[0]
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an|the|to)\s+/, "");
  const rules = [
    [/^licentious|libertine|dissipated/, "방탕할"],
    [/^varnish|lacquer|paint/, "옻"],
    [/^common|normal|frequent|regular/, "항상"],
    [/^commerce|business|trade/, "장사"],
    [/^mutual|reciprocal|each other/, "서로"],
    [/^frost/, "서리"],
    [/^wound|injury|hurt/, "상할"],
    [/^elephant|ivory|figure|image/, "코끼리"],
    [/^picture|image|figure|resemble/, "형상"],
    [/^repay|recompense|restitution/, "갚을"],
    [/^mourning|mourn|funeral/, "잃을"],
    [/^taste|experience|experiment/, "맛볼"],
    [/^bed|couch/, "평상"],
    [/^mulberry/, "뽕나무"],
    [/^what|why|where|which|how/, "어찌"],
    [/^summer/, "여름"],
    [/^congratulate/, "하례할"],
    [/^flaw|fault|defect/, "허물"],
    [/^lotus|water lily/, "연"],
    [/^shrimp|prawn/, "새우"],
    [/^afar|distant/, "멀"],
    [/^rosy clouds|clouds/, "노을"],
    [/^scare|frighten|intimidate/, "으를"],
    [/^raging fire|forge/, "불사를"],
    [/^asthma|disease/, "병"],
    [/^crack|fissure|split/, "틈"],
    [/^fill|full|satisfied/, "찰"],
    [/^swastika/, "만자"],
    [/^bend|curve/, "굽을"],
    [/^bay|cove|inlet/, "물굽이"],
    [/^deceive|lie/, "속일"],
    [/^creeping plants|tendrils|vines/, "덩굴"],
    [/^barbarian|barbarous|savage/, "오랑캐"],
    [/^mourn|pull|draw/, "끌"],
    [/^steamed bread|steamed dumplings/, "만두"],
    [/^eel/, "뱀장어"],
    [/^plaster|pave/, "흙손질할"],
    [/^scorn|despise|rude/, "업신여길"],
    [/^curtain|screen|tent/, "장막"],
    [/^plain silk|simple|plain/, "무늬없을"],
    [/^stretch|extend|expand/, "베풀"],
    [/^composition|chapter|section/, "글"],
    [/^will|going to|future|general/, "장수"],
    [/^palm|sole|paw/, "손바닥"],
    [/^form|appearance|shape/, "형상"],
    [/^unit of length|gentleman|husband/, "어른"],
    [/^rely upon|protector/, "의지할"],
    [/^prize|reward|award/, "장려할"],
    [/^tent|screen|mosquito net/, "휘장"],
    [/^cane|walking stick/, "지팡이"],
    [/^camphor/, "녹나무"],
    [/^mast/, "돛대"],
    [/^thick fluid|starch|broth/, "즙"],
    [/^forest/, "수풀"],
    [/^pine|fir/, "삼나무"],
    [/^mow|weed out|scythe/, "벨"],
    [/^ginseng/, "인삼"],
    [/^shirt|robe|gown|jacket/, "적삼"],
    [/^samarium/, "사마륨"],
    [/^wild hair/, "헝클어질"],
    [/^air|gas|steam|vapor|spirit/, "기운"],
    [/^(?:his|her|its|their|that)/, "그"],
    [/^period|date|time limit/, "기약"],
    [/^record|keep in mind|remember/, "기록할"],
    [/^foundation|base/, "터"],
    [/^skill|ability|talent|ingenuity/, "재주"],
    [/^receptacle|vessel|instrument/, "그릇"],
    [/^machine|moment|chance/, "틀"],
    [/^strange|unusual|uncanny/, "기이할"],
    [/^beg|request/, "빌"],
    [/^plan|stand on tiptoe/, "꾀할"],
    [/^hope|wish/, "바랄"],
    [/^be fond of/, "즐길"],
    [/^border|boundary/, "경계"],
    [/^prostitute/, "기생"],
    [/^no|not|negative/, "아닐"],
    [/^prefecture/, "마을"],
    [/^abundant|ample|rich|wealthy/, "부유할"],
    [/^float|drift|waft/, "뜰"],
    [/^bank up|cultivate/, "북돋울"],
    [/^tutor|teacher|assist/, "스승"],
    [/^split in two|slice|dissect/, "쪼갤"],
    [/^instruct|order/, "분부할"],
    [/^port/, "부두"],
    [/^married women|wife/, "며느리"],
    [/^brood over eggs|confidence/, "미쁠"],
    [/^buddha|buddhism/, "부처"],
    [/^shake off|brush away/, "떨칠"],
    [/^exorcise|remove evil/, "푸닥거리"],
    [/^countenance/, "낯빛"],
    [/^right|proper|correct|upright|straight/, "바를"],
    [/^government|politic|govern|rule/, "다스릴"],
    [/^decide|settle|fix|determine/, "정할"],
    [/^feeling|sentiment|emotion|affection/, "마음"],
    [/^essence|semen|spirit|refined/, "정할"],
    [/^quiet|still|motionless|calm/, "고요할"],
    [/^well|mine shaft|pit/, "우물"],
    [/^lantern|lamp|light/, "등불"],
    [/^sediment|dregs|precipitate/, "앙금"],
    [/^male adult|robust/, "고무래"],
    [/^pavilion|kiosk/, "정자"],
    [/^stop|suspend|delay|halt/, "머무를"],
    [/^spy|reconnoiter|detective/, "염탐할"],
    [/^submit|show|appear|petition/, "드릴"],
    [/^picture|scroll/, "그림"],
    [/^court$|courtyard|yard/, "뜰"],
    [/^to stand upright|stand upright|straighten/, "빼어날"],
    [/^orderly|neat|tidy|whole/, "가지런할"],
    [/^banner|flag/, "기"],
    [/^crystal|clear|bright|radiant/, "밝을"],
    [/^bridge|beam/, "다리"],
    [/^skillful|ingenious|clever/, "공교할"],
    [/^suburb|waste land|open space/, "들"],
    [/^compare|comparatively/, "견줄"],
    [/^sojourn|lodge/, "우거할"],
    [/^bite|gnaw|chew/, "씹을"],
    [/^tall|lofty|high/, "높을"],
    [/^seductive|loveable|tender|pretty|beautiful|handsome|attractive|graceful/, "고울"],
    [/^disturb|agitate|stir/, "어지러울"],
    [/^cunning|deceitful|treacherous/, "교활할"],
    [/^white|bright|brilliant|clear/, "흴"],
    [/^correct|rectify|straighten/, "바로잡을"],
    [/^twist|wring|intertwine/, "목맬"],
    [/^turn up|lift|elevate|raise/, "들"],
    [/^glue|gum|resin|rubber/, "아교"],
    [/^buckwheat/, "메밀"],
    [/^dragon|scaly dragon/, "교룡"],
    [/^sedan|palanquin/, "가마"],
    [/^dumpling|stuffed dumpling/, "만두"],
    [/^horse|spirited horse|post horse/, "말"],
    [/^shark/, "상어"],
    [/^flee|escape|break loose/, "달아날"],
    [/^indulge/, "편안할"],
    [/^row|file/, "줄"],
    [/^number one|one/, "한"],
    [/^overflow|brim/, "넘칠"],
    [/^rush forth|surpass|excel/, "앞지를"],
    [/^eat|to eat/, "먹을"],
    [/^proof|evidence|testify|verify/, "증거"],
    [/^summon|recruit/, "부를"],
    [/^clean|pure|cleanse/, "깨끗할"],
    [/^river/, "물"],
    [/^pool/, "못"],
    [/^jingling|tinkling/, "옥소리"],
    [/^jade/, "옥"],
    [/^eyeball|pupil/, "눈동자"],
    [/^anchor/, "닻"],
    [/^lucky|auspicious|fortunate|good omen/, "상서"],
    [/^journey|trip|schedule|agenda/, "길"],
    [/^hole|pitfall|trap|snare/, "함정"],
    [/^silk/, "비단"],
    [/^small boat|boat|ship/, "배"],
    [/^draw up|arrange|agreement/, "정할"],
    [/^virtuous|chaste|pure|loyal/, "곧을"],
    [/^state|province/, "나라"],
    [/^drunk|intoxicated|hangover/, "술취할"],
    [/^nail|spike/, "못"],
    [/^gong/, "징"],
    [/^ingot|bar of metal/, "쇳덩이"],
    [/^spindle|slab|cake|tablet/, "덩이"],
    [/^thunder/, "우레"],
    [/^pacify|appease|peaceful/, "편안할"],
    [/^top|peak|summit/, "꼭대기"],
    [/^large|big|great|vast/, "큰"],
    [/^small|little|tiny/, "작을"],
    [/^old|former|past|ancient|classic/, "옛"],
    [/^new|fresh/, "새"],
    [/^good|excellent|fine/, "좋을"],
    [/^bad|evil|wicked|wrong/, "악할"],
    [/^black|dark/, "검을"],
    [/^red|scarlet/, "붉을"],
    [/^blue|green/, "푸를"],
    [/^yellow/, "누를"],
    [/^round|circle/, "둥글"],
    [/^square/, "모"],
    [/^long/, "길"],
    [/^short/, "짧을"],
    [/^wide|broad/, "넓을"],
    [/^narrow/, "좁을"],
    [/^deep/, "깊을"],
    [/^shallow/, "얕을"],
    [/^heavy/, "무거울"],
    [/^light/, "가벼울"],
    [/^strong|firm|solid|hard|sturdy/, "굳셀"],
    [/^weak|timid/, "약할"],
    [/^fast|quick|rapid/, "빠를"],
    [/^slow/, "느릴"],
    [/^high/, "높을"],
    [/^low/, "낮을"],
    [/^hot|warm/, "더울"],
    [/^cold/, "찰"],
    [/^dry/, "마를"],
    [/^wet|moist/, "젖을"],
    [/^sweet/, "달"],
    [/^bitter/, "쓸"],
    [/^sour/, "실"],
    [/^salty/, "짤"],
    [/^fragrant|scent/, "향기"],
    [/^sound|voice|noise/, "소리"],
    [/^name|surname/, "이름"],
    [/^word|speech|speak|say|tell/, "말씀"],
    [/^write|writing|letter|script/, "글"],
    [/^read/, "읽을"],
    [/^book|volume/, "책"],
    [/^law|rule|regulation|commandment/, "법"],
    [/^ritual|ceremony|rite/, "예"],
    [/^music|pleasure|joy|delight/, "즐길"],
    [/^song|sing/, "노래"],
    [/^dance/, "춤"],
    [/^food|eat|meal/, "먹을"],
    [/^drink|wine|liquor/, "마실"],
    [/^clothes|garment|robe|skirt/, "옷"],
    [/^hat|cap/, "갓"],
    [/^house|home|room|building|hall|temple|palace/, "집"],
    [/^city|town|village|market/, "고을"],
    [/^road|path|way|street/, "길"],
    [/^gate|door/, "문"],
    [/^wall/, "담"],
    [/^garden|park/, "동산"],
    [/^mountain|hill|peak/, "산"],
    [/^valley/, "골"],
    [/^sea|ocean/, "바다"],
    [/^lake/, "호수"],
    [/^island/, "섬"],
    [/^cloud/, "구름"],
    [/^rain/, "비"],
    [/^snow/, "눈"],
    [/^wind/, "바람"],
    [/^star/, "별"],
    [/^flower/, "꽃"],
    [/^grass|herb/, "풀"],
    [/^leaf/, "잎"],
    [/^root/, "뿌리"],
    [/^fruit/, "열매"],
    [/^grain|rice|millet|wheat/, "곡식"],
    [/^bamboo/, "대"],
    [/^willow/, "버들"],
    [/^pine/, "소나무"],
    [/^plum/, "매화"],
    [/^bird/, "새"],
    [/^fish/, "물고기"],
    [/^dog/, "개"],
    [/^cow|ox|cattle/, "소"],
    [/^sheep|goat/, "양"],
    [/^pig|boar/, "돼지"],
    [/^deer/, "사슴"],
    [/^tiger/, "범"],
    [/^insect|worm/, "벌레"],
    [/^shell|clam/, "조개"],
    [/^body/, "몸"],
    [/^head/, "머리"],
    [/^face/, "얼굴"],
    [/^eye/, "눈"],
    [/^ear/, "귀"],
    [/^mouth/, "입"],
    [/^nose/, "코"],
    [/^tooth|teeth/, "이"],
    [/^hand/, "손"],
    [/^foot|feet/, "발"],
    [/^hair/, "머리털"],
    [/^bone/, "뼈"],
    [/^blood/, "피"],
    [/^flesh|meat/, "고기"],
    [/^father/, "아비"],
    [/^mother/, "어미"],
    [/^elder brother/, "형"],
    [/^younger brother/, "아우"],
    [/^son/, "아들"],
    [/^daughter/, "딸"],
    [/^wife/, "아내"],
    [/^friend/, "벗"],
    [/^servant|slave/, "종"],
    [/^teacher|master/, "스승"],
    [/^student|scholar/, "선비"],
    [/^army|military|soldier|troop/, "군사"],
    [/^king|ruler|lord|prince|emperor/, "임금"],
    [/^official|office|bureaucrat/, "벼슬"],
    [/^country|nation|kingdom/, "나라"],
    [/^people|person|man|human/, "사람"],
    [/^woman|female/, "여자"],
    [/^child|boy|girl/, "아이"],
    [/^heart|mind/, "마음"],
    [/^thought|think|consider/, "생각"],
    [/^love/, "사랑"],
    [/^anger|rage/, "성낼"],
    [/^fear|dread/, "두려워할"],
    [/^sad|sorrow/, "슬플"],
    [/^laugh|smile/, "웃을"],
    [/^cry|weep/, "울"],
    [/^know|understand/, "알"],
    [/^remember/, "기억할"],
    [/^forget/, "잊을"],
    [/^ask|question/, "물을"],
    [/^answer|reply/, "대답"],
    [/^teach/, "가르칠"],
    [/^learn|study/, "배울"],
    [/^make|do|work|act/, "할"],
    [/^use|employ/, "쓸"],
    [/^take|hold|grasp|seize/, "잡을"],
    [/^give|grant|bestow/, "줄"],
    [/^receive|accept/, "받을"],
    [/^send|dispatch/, "보낼"],
    [/^come|arrive/, "올"],
    [/^go|leave/, "갈"],
    [/^return|again/, "돌아올"],
    [/^enter/, "들"],
    [/^exit|go out/, "날"],
    [/^open/, "열"],
    [/^close|shut/, "닫을"],
    [/^rise|raise|lift/, "일어날"],
    [/^fall|drop/, "떨어질"],
    [/^move|walk|travel|go/, "다닐"],
    [/^run/, "달릴"],
    [/^fly/, "날"],
    [/^sit/, "앉을"],
    [/^stand/, "설"],
    [/^sleep/, "잘"],
    [/^rest/, "쉴"],
    [/^hide|conceal/, "숨길"],
    [/^cover/, "덮을"],
    [/^cut|chop|slice/, "자를"],
    [/^break|destroy|smash/, "깨뜨릴"],
    [/^kill|slaughter/, "죽일"],
    [/^save|rescue/, "구원할"],
    [/^help|assist|aid/, "도울"],
    [/^protect|guard|defend/, "지킬"],
    [/^attack|strike|hit|beat/, "칠"],
    [/^fight|battle|war/, "싸울"],
    [/^follow|obey/, "따를"],
    [/^lead|guide/, "인도할"],
    [/^join|connect|attach/, "이을"],
    [/^divide|separate|part/, "나눌"],
    [/^gather|collect|assemble/, "모을"],
    [/^scatter|spread/, "흩을"],
    [/^choose|select|pick/, "가릴"],
    [/^change|exchange|transform/, "바꿀"],
    [/^measure|weigh/, "헤아릴"],
    [/^count|number/, "셀"],
    [/^buy/, "살"],
    [/^sell/, "팔"],
    [/^price|value|wealth|property|treasure/, "재물"],
    [/^money|coin/, "돈"],
    [/^cart|vehicle|carriage|chariot/, "수레"],
    [/^weapon|sword|knife|bow|arrow|spear/, "무기"],
    [/^medicine|drug/, "약"],
    [/^disease|illness|sick/, "병"],
  ];
  const found = rules.find(([pattern]) => pattern.test(first));
  if (found) return found[1];
  const firstWord = first.match(/[a-z]+/)?.[0] || "";
  const broad = {
    mix: "섞을", exchange: "바꿀", deliver: "전할", school: "학교", beam: "들보",
    proud: "교만할", shout: "부르짖을", nimble: "날랠", monopoly: "독점", cellar: "곳집",
    bowl: "그릇", sacrifice: "제사", display: "보일", exhort: "타이를", modest: "겸손할",
    supple: "부드러울", stalk: "줄기", prop: "버틸", polish: "닦을", ornament: "꾸밀",
    root: "뿌리", toll: "세금", levy: "거둘", lucky: "다행", banner: "기", tablet: "패",
    instruct: "가르칠", order: "명령할", command: "명령할", float: "뜰", drift: "뜰",
    overflow: "넘칠", full: "찰", bend: "굽을", curve: "굽을", deceive: "속일",
    pull: "끌", draw: "끌", curtain: "휘장", screen: "가릴", tent: "장막",
    ashamed: "부끄러울", sigh: "탄식할", praise: "칭찬할", reward: "상줄",
    repay: "갚을", resemble: "닮을", image: "형상", shape: "형상", form: "형상",
    appearance: "모양", common: "항상", normal: "항상", frequent: "자주", regular: "법식",
    business: "장사", trade: "장사", commerce: "장사", mutual: "서로",
    frost: "서리", wound: "상처", injury: "상처", lotus: "연", flaw: "허물",
    distant: "멀", afar: "멀", crack: "틈", fissure: "틈", shrimp: "새우",
    ginseng: "인삼", robe: "옷", shirt: "옷", jacket: "옷", robe: "옷",
    no: "아닐", negative: "아닐", abundant: "넉넉할", rich: "부유할",
    tutor: "스승", split: "쪼갤", married: "며느리", confidence: "믿을",
  };
  return broad[firstWord] || "";
}

async function showCandidateEntry(char, koreanReadingTokens = []) {
  status.textContent = `${char} 음운 데이터를 불러오는 중입니다...`;
  try {
    await loadDeferredDictionaryData();
  } catch (error) {
    status.textContent = error?.message || "음운 데이터를 불러오지 못했습니다.";
    return;
  }
  const entry = lookupEntry(char);
  if (!entry) {
    status.textContent = `${char} 데이터를 찾지 못했습니다.`;
    return;
  }
  results.innerHTML = "";
  const filtered = entry.readings.filter((reading) => koreanReadingMatches(reading.sino?.korean, koreanReadingTokens));
  results.append(renderKoreanFilteredEntry(entry, koreanReadingTokens));
  const suffix = filtered.length
    ? ` (${koreanReadingTokens.join(", ")} 독음 ${filtered.length}개)`
    : "";
  status.textContent = `${entry.char} 항목을 표시했습니다${suffix}.`;
}

function renderKoreanFilteredEntry(entry, tokens) {
  return renderFilteredEntry(
    entry,
    (reading) => koreanReadingMatches(reading.sino?.korean, tokens),
    (reading) => narrowReadingKoreanToTokens(reading, tokens),
  );
}

function narrowReadingKoreanToTokens(reading, tokens) {
  const narrowed = displayKoreanReadingTokens(matchingKoreanReadingTokens(reading.sino?.korean, tokens), tokens);
  if (!narrowed.length) return reading;
  return {
    ...reading,
    sino: {
      ...reading.sino,
      korean: narrowed.join(" "),
    },
  };
}

function koreanReadingMatches(value, tokens) {
  return !tokens.filter(Boolean).length || matchingKoreanReadingTokens(value, tokens).length > 0;
}

function matchingKoreanReadingTokens(value, tokens) {
  const wanted = new Set(tokens.filter(Boolean).flatMap(koreanReadingSearchEquivalents));
  if (!wanted.size) return [];
  const readings = splitSearchTokens(koreanToHangul(value || ""));
  return readings.filter((token) => wanted.has(token) || koreanInitialLawAliases(token).some((alias) => wanted.has(alias)));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(queryInput.value);
});

status.textContent = "검색할 한자를 입력하세요.";
