# 중고한어 음운 사전

정체자 한자를 검색하면 다음 정보를 한 화면에서 비교하는 정적 웹앱입니다.

- 초기중고한어 성모와 운모
- 만기중고한어 성모와 운모
- 성모 IPA와 운모 IPA/재구 표기
- 중고한어 독음별 의미 범위
- 운모의 韻, 攝, 等, 開合, 聲調
- 현대 표준중국어 한자음
- 광동어 한자음
- 일본어 오음·한음의 현대 가나 / 역사적 가나 표기
- 한국 한자음
- 베트남 한자음
- `樂`처럼 호환 한자를 입력해도 정규화해 검색

## 실행

의존성이 없는 정적 앱이므로 `index.html`을 브라우저에서 열면 됩니다.

## 데이터 추가

`data.js`의 `DICTIONARY` 배열에 항목을 추가하세요. 기본 원칙은 “한 글자 = 여러 중고한어 독음의 묶음”입니다. 한 글자에 여러 독음이 있으면 `readings` 배열에 독음을 여러 개 넣고, 각 독음마다 `meaning`을 따로 적으면 됩니다.

표기 원칙은 다음과 같습니다.

- 표준중국어: 한어병음
- 광동어: 월병/Jyutping
- 일본 한자음: 가타카나. 오음, 한음, 관용음을 행으로 구분
- 한국 한자음: 한글
- 베트남 한자음: 쯔꾸옥응으

현재 자동 수집된 Unihan 데이터는 앱에서 화면 표시 시 일본 On 로마자를 가타카나로, 한국 한자음 로마자를 한글로 변환합니다. 베트남 한자음은 Unihan `kVietnamese`보다 Hán-Việt 전용 자료인 KanjiDictVN 값을 우선 사용합니다. 전기중고한어는 Wiktionary `ltc-pron` 자료를 우선 사용하고, 누락된 글자는 WikiHan의 Baxter-Sagart 2014 중고한어 IPA 자료로 보강합니다. 오음/한음의 정밀 구분과 역사적 가나 표기는 별도 자료로 계속 보강해야 합니다.

Wiktionary `ltc-pron`에서 온 중고한어 성모 IPA와 운모 IPA/재구 표기는 앱의 대응표로 자동 보강합니다. 만기중고한어는 문헌 기반 원자료가 연결된 뒤 별도로 채우는 것을 원칙으로 하며, 현재는 구조화된 전기중고한어 분류가 있을 때만 임시 파생값을 표시합니다.

```js
{
  char: "字",
  meaning: "뜻풀이",
  readings: [
    {
      label: "字 ‘글자’",
      meaning: "이 음으로 읽을 때의 뜻풀이",
      emc: {
        initial: "從母",
        initialIpa: "dz-",
        final: "之韻",
        finalReconstruction: "-i",
        division: "三等",
        rhymeGroup: "止攝",
        openness: "開口",
        tone: "去聲"
      },
      lmc: {
        initial: "從系",
        initialIpa: "dz-/z- 계열",
        final: "之韻",
        finalReconstruction: "-ɨ 계열",
        division: "三等",
        rhymeGroup: "止攝",
        openness: "開口",
        tone: "去聲"
      },
      sino: {
        mandarin: "zì",
        cantonese: "zi6",
        japaneseGo: {
          modernKana: "ジ",
          historicalKana: "ジ"
        },
        japaneseKan: {
          modernKana: "シ",
          historicalKana: "シ"
        },
        japaneseKanyo: {
          modernKana: "",
          historicalKana: ""
        },
        korean: "자",
        vietnamese: "tự"
      }
    }
  ]
}
```

일본어 오음/한음은 현대 가나 표기를 먼저, 역사적 가나 표기를 뒤에 둡니다. 둘 다 가타카나로 적습니다.

```js
sino: {
  mandarin: "rù",
  cantonese: "jap6",
  japaneseGo: {
    modernKana: "ニュウ",
    historicalKana: "ニフ"
  },
  japaneseKan: {
    modernKana: "ジュウ",
    historicalKana: "ジフ"
  },
  japaneseKanyo: {
    modernKana: "ジュ",
    historicalKana: ""
  },
  korean: "입",
  vietnamese: "nhập"
}
```

화면에는 다음처럼 표시됩니다.

- 일본 오음: ニュウ / ニフ
- 일본 한음: ジュウ / ジフ
- 일본 관용음: ジュ

## 권장 공개 자료

전체 사전화를 하려면 자료별 라이선스를 지켜 병합해야 합니다.

- Unicode Unihan: 현대 한자문화권 독음 확장 후보
- WikiHan: Baxter-Sagart 2014 중고한어 IPA 보강 자료
- CC-CEDICT: 표준중국어 병음과 중국어 뜻풀이 확장 후보
- CC-Canto: 광동어 Jyutping 확장 후보
- Wiktionary Middle Chinese appendix: 중고한어 성모·운모 및 재구음 참고

중고한어의 “초기/만기” 구분은 학자별 체계가 다르므로, 대량화할 때는 Baxter, Pulleyblank, Zhengzhang 등 어떤 재구 체계를 기본값으로 삼을지 먼저 고정하는 것이 좋습니다.
