"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "today" | "free" | "diagnostic" | "vocab" | "grammar" | "reading" | "listening" | "mock" | "wrong" | "dashboard";
type Skill = "vocab" | "grammar" | "reading" | "listening";
type Level = "new" | "learning" | "review" | "mastered";
type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1" | "unknown";
type FuriganaMode = "exam" | "learning" | "hidden";

type Example = {
  jp: string;
  furigana: string;
  ko: string;
  jlptLevel?: JlptLevel;
};

type StudyItem = Example & {
  id: string;
  kind: Skill;
  title: string;
  focus: string;
  koreanHint: string;
  pitfall: string;
  answer: string;
  choices: string[];
};

type WrongEntry = {
  id: string;
  title: string;
  correct: string;
  chosen: string;
  at: string;
  kind: Skill | "diagnostic";
};

type Progress = {
  startedAt: string;
  lastStudyDate: string;
  streak: number;
  xp: number;
  diagnosticScore: number | null;
  completedDays: number[];
  srs: Record<string, { ease: number; due: string; seen: number; correct: number; level: Level }>;
  wrong: WrongEntry[];
  totalAnswered: number;
  totalCorrect: number;
  todayAnswered: number;
  todayCorrect: number;
  statsByKind: Record<Skill | "diagnostic" | "mock", { answered: number; correct: number }>;
  recentIds: string[];
  studySeconds: number;
  furiganaMode: FuriganaMode;
  showFurigana?: boolean;
  darkMode: boolean;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  example: Example;
  choices: string[];
  answer: string;
  explanation: string;
  kind: Skill | "diagnostic";
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const defaultProgress: Progress = {
  startedAt: todayIso(),
  lastStudyDate: "",
  streak: 0,
  xp: 0,
  diagnosticScore: null,
  completedDays: [],
  srs: {},
  wrong: [],
  totalAnswered: 0,
  totalCorrect: 0,
  todayAnswered: 0,
  todayCorrect: 0,
  statsByKind: {
    vocab: { answered: 0, correct: 0 },
    grammar: { answered: 0, correct: 0 },
    reading: { answered: 0, correct: 0 },
    listening: { answered: 0, correct: 0 },
    diagnostic: { answered: 0, correct: 0 },
    mock: { answered: 0, correct: 0 },
  },
  recentIds: [],
  studySeconds: 0,
  furiganaMode: "exam",
  darkMode: false,
};

const getChoiceSeed = (id: string) => id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

const shuffleChoices = (choices: string[], id: string) => {
  const shuffled = [...choices];
  let seed = getChoiceSeed(id);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};


const difficultRubyMap: Record<string, { reading: string; level: JlptLevel }> = {
  難: { reading: "むずか", level: "N4" },
  単語: { reading: "たんご", level: "N3" },
  語彙: { reading: "ごい", level: "N2" },
  以前: { reading: "いぜん", level: "N2" },
  家賃: { reading: "やちん", level: "N2" },
  台風: { reading: "たいふう", level: "N2" },
  申込書: { reading: "もうしこみしょ", level: "N2" },
  受験票: { reading: "じゅけんひょう", level: "N2" },
  身分証: { reading: "みぶんしょう", level: "unknown" },
  飲食: { reading: "いんしょく", level: "N2" },
  発表会: { reading: "はっぴょうかい", level: "N2" },
  模試: { reading: "もし", level: "unknown" },
  以内: { reading: "いない", level: "N2" },
  以外: { reading: "いがい", level: "N2" },
};

const isAboveN3 = (level?: JlptLevel) => level === "N2" || level === "N1" || level === "unknown";

function renderJapaneseWithRuby(text: string, mode: FuriganaMode, revealed: boolean, answerTerm?: string) {
  if (mode === "hidden") return text;
  const entries = Object.entries(difficultRubyMap).sort((a, b) => b[0].length - a[0].length);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const match = entries.find(([word, meta]) => text.startsWith(word, cursor) && (mode === "learning" || isAboveN3(meta.level)) && (!answerTerm || revealed || word !== answerTerm));
    if (!match) {
      parts.push(text[cursor]);
      cursor += 1;
      continue;
    }
    const [word, meta] = match;
    parts.push(<ruby key={`${word}-${cursor}`}>{word}<rt>{meta.reading}</rt></ruby>);
    cursor += word.length;
  }
  return parts;
}

function getVoicesWhenReady() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve<SpeechSynthesisVoice[]>([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timer = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 700);
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

const vocabItems: StudyItem[] = [
  {
    id: "v-uketoru",
    kind: "vocab",
    title: "受け取る",
    focus: "받다 / 받아들이다",
    jp: "受付で資料を受け取りました。",
    furigana: "うけつけで しりょうを うけとりました。",
    ko: "접수처에서 자료를 받았습니다.",
    koreanHint: "한국어 ‘받다’처럼 물건에도, 말·감정에도 쓰입니다. N3에서는 受ける보다 ‘실제로 손에 받다’ 느낌을 잡으세요.",
    pitfall: "もらう는 상대의 호의가 느껴지고, 受け取る는 전달된 것을 수령하는 객관적 느낌입니다.",
    answer: "수령하다",
    choices: ["수령하다", "예약하다", "도착하다", "거절하다"],
  },
  {
    id: "v-kakunin",
    kind: "vocab",
    title: "確認する",
    focus: "확인하다",
    jp: "出発する前に時間を確認してください。",
    furigana: "しゅっぱつする まえに じかんを かくにんしてください。",
    ko: "출발하기 전에 시간을 확인해 주세요.",
    koreanHint: "한국어 ‘확인’과 거의 1:1입니다. 시험에서는 前に와 같이 순서를 묻는 문장에 자주 나옵니다.",
    pitfall: "調べる는 ‘조사하다’, 確認する는 이미 있는 정보가 맞는지 체크하는 느낌입니다.",
    answer: "확인하다",
    choices: ["확인하다", "계산하다", "소개하다", "상담하다"],
  },
  {
    id: "v-kanarazu",
    kind: "vocab",
    title: "必ず",
    focus: "반드시 / 꼭",
    jp: "宿題は必ず明日までに出してください。",
    furigana: "しゅくだいは かならず あしたまでに だしてください。",
    ko: "숙제는 반드시 내일까지 제출해 주세요.",
    koreanHint: "한국어 ‘꼭’처럼 의무·확신이 강합니다. ぜひ는 권유의 ‘꼭’이고 必ず는 규칙의 ‘반드시’입니다.",
    pitfall: "きっと는 추측 ‘분명’, 必ず는 실행·규칙 ‘반드시’입니다.",
    answer: "반드시",
    choices: ["반드시", "아마", "천천히", "가끔"],
  },
  {
    id: "v-chigai",
    kind: "vocab",
    title: "違い",
    focus: "차이",
    jp: "この二つの言葉の違いが分かりますか。",
    furigana: "この ふたつの ことばの ちがいが わかりますか。",
    ko: "이 두 단어의 차이를 알겠습니까?",
    koreanHint: "違う는 ‘다르다’, 違い는 명사 ‘차이’입니다. 한국어처럼 형용사와 명사를 구분해 외우면 빠릅니다.",
    pitfall: "間違い는 ‘실수/틀림’입니다. 違い와 한 글자 차이라 독해에서 자주 헷갈립니다.",
    answer: "차이",
    choices: ["차이", "실패", "경험", "약속"],
  },
  {
    id: "v-shiraberu",
    kind: "vocab",
    title: "調べる",
    focus: "조사하다 / 찾아보다",
    jp: "分からない言葉を辞書で調べました。",
    furigana: "わからない ことばを じしょで しらべました。",
    ko: "모르는 단어를 사전에서 찾아봤습니다.",
    koreanHint: "‘검색해 보다’에 가까운 단어입니다. 시험에서는 辞書で, インターネットで와 잘 붙습니다.",
    pitfall: "探す는 잃어버린 것을 ‘찾다’, 調べる는 정보를 ‘찾아보다’입니다.",
    answer: "찾아보다",
    choices: ["찾아보다", "잃어버리다", "초대하다", "외우다"],
  },
  {
    id: "v-mamonaku",
    kind: "vocab",
    title: "まもなく",
    focus: "곧 / 머지않아",
    jp: "電車はまもなく到着します。",
    furigana: "でんしゃは まもなく とうちゃくします。",
    ko: "전철은 곧 도착합니다.",
    koreanHint: "안내 방송의 ‘잠시 후’ 느낌입니다. すぐ보다 조금 공식적입니다.",
    pitfall: "もうすぐ와 뜻은 비슷하지만 まもなく는 방송·안내문에서 더 자주 보입니다.",
    answer: "곧",
    choices: ["곧", "일부러", "드디어", "전혀"],
  },
  {
    id: "v-nigate",
    kind: "vocab",
    title: "苦手",
    focus: "서툴다 / 약하다",
    jp: "漢字は苦手ですが、毎日少しずつ覚えています。",
    furigana: "かんじは にがてですが、まいにち すこしずつ おぼえています。",
    ko: "한자는 약하지만 매일 조금씩 외우고 있습니다.",
    koreanHint: "한국어 ‘못한다’보다 부드러운 ‘약하다/서툴다’입니다. 자기 약점을 말할 때 시험 회화에 자주 나옵니다.",
    pitfall: "下手는 실력이 낮다는 평가가 더 직접적이고, 苦手는 심리적으로 어렵고 약하다는 느낌입니다.",
    answer: "서툴다",
    choices: ["서툴다", "익숙하다", "간단하다", "조용하다"],
  },
  {
    id: "v-nareru",
    kind: "vocab",
    title: "慣れる",
    focus: "익숙해지다",
    jp: "日本語の音に慣れるために、毎朝聞いています。",
    furigana: "にほんごの おとに なれるために、まいあさ きいています。",
    ko: "일본어 소리에 익숙해지기 위해 매일 아침 듣고 있습니다.",
    koreanHint: "한국어 ‘익숙해지다’와 비슷하지만 조사 に와 붙는 점을 통째로 외우세요: 音に慣れる.",
    pitfall: "習う는 배우다, 慣れる는 몸이 적응하다입니다. ‘배워지다’로 직역하면 어색합니다.",
    answer: "익숙해지다",
    choices: ["익숙해지다", "배우다", "고치다", "정하다"],
  },
  {
    id: "v-fueru",
    kind: "vocab",
    title: "増える",
    focus: "늘다 / 증가하다",
    jp: "練習すると、分かる言葉が増えます。",
    furigana: "れんしゅうすると、わかる ことばが ふえます。",
    ko: "연습하면 아는 단어가 늘어납니다.",
    koreanHint: "한국어 ‘늘다’입니다. 자동사라서 ‘단어가 늘다’처럼 が와 잘 붙습니다.",
    pitfall: "増やす는 내가 늘리는 타동사, 増える는 저절로/결과적으로 늘어나는 자동사입니다.",
    answer: "늘다",
    choices: ["늘다", "줄이다", "바꾸다", "멈추다"],
  },
  {
    id: "v-herasu",
    kind: "vocab",
    title: "減らす",
    focus: "줄이다",
    jp: "間違いを減らすために、答えを確認します。",
    furigana: "まちがいを へらすために、こたえを かくにんします。",
    ko: "실수를 줄이기 위해 답을 확인합니다.",
    koreanHint: "한국어 ‘줄이다’와 같습니다. を가 보이면 내가 무엇을 줄이는지 묻는 문제로 자주 나옵니다.",
    pitfall: "減る는 줄다, 減らす는 줄이다입니다. 한국어도 ‘줄다/줄이다’가 다르듯이 구분하세요.",
    answer: "줄이다",
    choices: ["줄이다", "늘다", "빌리다", "도와주다"],
  },
  {
    id: "v-moushikomu",
    kind: "vocab",
    title: "申し込む",
    focus: "신청하다",
    jp: "試験を受ける人は、今週中に申し込んでください。",
    furigana: "しけんを うける ひとは、こんしゅうちゅうに もうしこんでください。",
    ko: "시험을 볼 사람은 이번 주 안에 신청해 주세요.",
    koreanHint: "시험·강좌·서비스에 ‘신청하다’입니다. JLPT 안내문에서 자주 보이는 생존 단어입니다.",
    pitfall: "予約する는 시간·좌석을 예약, 申し込む는 참가/이용을 신청하는 느낌입니다.",
    answer: "신청하다",
    choices: ["신청하다", "취소하다", "설명하다", "반복하다"],
  },
  {
    id: "v-enryo",
    kind: "vocab",
    title: "遠慮する",
    focus: "삼가다 / 사양하다",
    jp: "教室では携帯電話の使用をご遠慮ください。",
    furigana: "きょうしつでは けいたいでんわの しようを ごえんりょください。",
    ko: "교실에서는 휴대전화 사용을 삼가 주세요.",
    koreanHint: "한국어 안내문의 ‘삼가 주십시오’입니다. 금지보다 부드럽지만 실제로는 하지 말라는 뜻입니다.",
    pitfall: "정중하다고 허락으로 착각하지 마세요. ご遠慮ください는 시험 독해에서 ‘금지’로 처리합니다.",
    answer: "삼가다",
    choices: ["삼가다", "허락하다", "기다리다", "소개하다"],
  },
];

const grammarItems: StudyItem[] = [
  {
    id: "g-you-ni-suru",
    kind: "grammar",
    title: "V辞書/ない + ようにする",
    focus: "~하도록 하다 / 습관적으로 신경 쓰다",
    jp: "毎日、日本語を声に出して読むようにしています。",
    furigana: "まいにち、にほんごを こえに だして よむように しています。",
    ko: "매일 일본어를 소리 내어 읽도록 하고 있습니다.",
    koreanHint: "한국어 ‘~하려고 하고 있어요’보다 ‘그렇게 되게 습관을 관리한다’에 가깝습니다.",
    pitfall: "ようにしてください는 부탁, ようにしています는 내 습관입니다. 한국어로 둘 다 ‘~하도록’이라 헷갈립니다.",
    answer: "습관적으로 ~하도록 하다",
    choices: ["습관적으로 ~하도록 하다", "막 ~하려던 참이다", "~할 수밖에 없다", "~해 버렸다"],
  },
  {
    id: "g-tame-ni",
    kind: "grammar",
    title: "V辞書 + ために",
    focus: "~하기 위해서",
    jp: "試験に合格するために、文法を復習します。",
    furigana: "しけんに ごうかくする ために、ぶんぽうを ふくしゅうします。",
    ko: "시험에 합격하기 위해서 문법을 복습합니다.",
    koreanHint: "한국어 ‘~기 위해서’와 매우 비슷합니다. 앞뒤 주어가 보통 같은 사람일 때 자연스럽습니다.",
    pitfall: "ように는 가능·상태 목표, ために는 의지로 하는 목적입니다. ‘합격하기 위해’는 ために가 자연스럽습니다.",
    answer: "~하기 위해서",
    choices: ["~하기 위해서", "~했는데도", "~하자마자", "~할 정도로"],
  },
  {
    id: "g-noni",
    kind: "grammar",
    title: "普通形 + のに",
    focus: "~인데도 / ~했는데도",
    jp: "たくさん勉強したのに、漢字を忘れました。",
    furigana: "たくさん べんきょうしたのに、かんじを わすれました。",
    ko: "많이 공부했는데도 한자를 잊어버렸습니다.",
    koreanHint: "한국어 ‘분명 A했는데 왜 B야?’라는 아쉬움·불만이 들어갑니다.",
    pitfall: "하지만의 でも보다 감정이 강합니다. 결과가 기대와 달라서 속상한 느낌을 잡으세요.",
    answer: "~인데도",
    choices: ["~인데도", "~하기 전에", "~한 덕분에", "~할 때마다"],
  },
  {
    id: "g-sou-da",
    kind: "grammar",
    title: "ます형 + そうだ",
    focus: "곧 ~할 것 같다 / 보기엔 ~해 보인다",
    jp: "雨が降りそうなので、傘を持って行きます。",
    furigana: "あめが ふりそうなので、かさを もっていきます。",
    ko: "비가 올 것 같아서 우산을 가지고 갑니다.",
    koreanHint: "눈앞의 단서를 보고 ‘곧 그럴 듯하다’입니다. 한국어 ‘올 것 같아’와 비슷하지만 직접 관찰 느낌이 강합니다.",
    pitfall: "伝聞 そうです(들었다)와 모양이 비슷합니다. 降りそうだ는 ‘내가 보기엔 올 듯’, 降るそうだ는 ‘비가 온대’입니다.",
    answer: "~할 것 같다",
    choices: ["~할 것 같다", "~해도 된다", "~하지 말자", "~한 적이 있다"],
  },
  {
    id: "g-baai",
    kind: "grammar",
    title: "普通形 + 場合は",
    focus: "~한 경우에는",
    jp: "遅れる場合は、必ず連絡してください。",
    furigana: "おくれる ばあいは、かならず れんらくしてください。",
    ko: "늦는 경우에는 반드시 연락해 주세요.",
    koreanHint: "한국어 안내문 ‘~할 경우’와 거의 같습니다. 회화보다 공지·규칙에서 자주 보입니다.",
    pitfall: "時는 단순히 ‘때’, 場合は는 조건·대응이 필요한 ‘경우’입니다.",
    answer: "~한 경우에는",
    choices: ["~한 경우에는", "~하지 않고", "~한 채로", "~한 김에"],
  },
  {
    id: "g-koto-ni-suru",
    kind: "grammar",
    title: "V辞書/ない + ことにする",
    focus: "~하기로 하다",
    jp: "今日から寝る前に単語を覚えることにしました。",
    furigana: "きょうから ねるまえに たんごを おぼえることにしました。",
    ko: "오늘부터 자기 전에 단어를 외우기로 했습니다.",
    koreanHint: "내가 결정한 ‘~하기로 했다’입니다. 한국어와 거의 같지만 ことになった는 외부 결정입니다.",
    pitfall: "ことにする=내 결정, ことになる=상황/규칙으로 정해짐. 한국어는 둘 다 ‘~하게 되다/하기로 하다’로 번역되어 주체를 봐야 합니다.",
    answer: "~하기로 하다",
    choices: ["~하기로 하다", "~할 뻔하다", "~하는 중이다", "~하지 않아도 된다"],
  },
  {
    id: "g-te-shimau",
    kind: "grammar",
    title: "Vて + しまう",
    focus: "~해 버리다 / 완료·아쉬움",
    jp: "大切なプリントを家に忘れてしまいました。",
    furigana: "たいせつな プリントを いえに わすれてしまいました。",
    ko: "중요한 프린트를 집에 잊어버리고 왔습니다.",
    koreanHint: "한국어 ‘~해 버렸다’처럼 끝나 버린 느낌과 아쉬움이 함께 옵니다.",
    pitfall: "항상 나쁜 뜻은 아닙니다. 全部読んでしまった는 ‘다 읽어 버렸다/끝냈다’처럼 완료 강조가 됩니다.",
    answer: "~해 버리다",
    choices: ["~해 버리다", "~하려고 하다", "~하지 않아도 된다", "~한 적이 없다"],
  },
  {
    id: "g-hazu-da",
    kind: "grammar",
    title: "普通形 + はずだ",
    focus: "~일 것이다 / 당연히 ~해야 한다",
    jp: "昨日送ったので、今日届くはずです。",
    furigana: "きのう おくったので、きょう とどくはずです。",
    ko: "어제 보냈으니 오늘 도착할 것입니다.",
    koreanHint: "근거가 있어서 ‘당연히 그럴 것’이라는 느낌입니다. 한국어 ‘~할 텐데/것이다’와 가깝습니다.",
    pitfall: "でしょう는 부드러운 추측, はずだ는 근거 기반 확신입니다.",
    answer: "근거 있는 확신",
    choices: ["근거 있는 확신", "가벼운 부탁", "경험 없음", "금지 명령"],
  },
  {
    id: "g-tokoro",
    kind: "grammar",
    title: "V辞書/ている/た + ところ",
    focus: "막 ~하려는/하는/한 참",
    jp: "今、先生に質問しているところです。",
    furigana: "いま、せんせいに しつもんしているところです。",
    ko: "지금 선생님께 질문하고 있는 중입니다.",
    koreanHint: "한국어 ‘딱 그 타이밍’입니다. するところ=하려는 참, しているところ=하는 중, したところ=막 한 참.",
    pitfall: "ているところ는 진행 순간을 강조하고, ている만 쓰면 일반적인 상태도 될 수 있습니다.",
    answer: "딱 그 시점",
    choices: ["딱 그 시점", "반복 습관", "허가", "반대 이유"],
  },
  {
    id: "g-you-da",
    kind: "grammar",
    title: "普通形 + ようだ",
    focus: "~인 것 같다",
    jp: "外が静かなので、雨が止んだようです。",
    furigana: "そとが しずかなので、あめが やんだようです。",
    ko: "밖이 조용하니 비가 그친 것 같습니다.",
    koreanHint: "상황을 보고 판단하는 ‘~인 것 같다’입니다. 한국어처럼 넓게 쓰지만 근거가 문장 안에 자주 있습니다.",
    pitfall: "そうだ는 눈앞 모양/전언, ようだ는 종합 판단입니다. 한국어 번역이 같아도 근거 종류를 보세요.",
    answer: "상황 판단",
    choices: ["상황 판단", "강한 의무", "겸손한 요청", "목적"],
  },
  {
    id: "g-aida-ni",
    kind: "grammar",
    title: "A間にB",
    focus: "A하는 동안에 B를 끝내다",
    jp: "休み時間の間に、単語を十個覚えました。",
    furigana: "やすみじかんの あいだに、たんごを じゅっこ おぼえました。",
    ko: "쉬는 시간 동안에 단어 10개를 외웠습니다.",
    koreanHint: "한국어 ‘~하는 사이에’입니다. に가 붙으면 그 기간 안에 사건이 완료되는 느낌입니다.",
    pitfall: "間는 계속 그 상태, 間に는 그 사이 한 번/완료된 사건입니다.",
    answer: "~하는 사이에",
    choices: ["~하는 사이에", "~하기 위해서", "~인데도", "~할 수 있다"],
  },
  {
    id: "g-te-oku",
    kind: "grammar",
    title: "Vて + おく",
    focus: "미리 ~해 두다",
    jp: "試験の前に、会場までの道を調べておきます。",
    furigana: "しけんの まえに、かいじょうまでの みちを しらべておきます。",
    ko: "시험 전에 시험장까지 가는 길을 미리 알아 둡니다.",
    koreanHint: "한국어 ‘~해 두다’와 거의 같습니다. 미래에 편하려고 지금 준비하는 느낌입니다.",
    pitfall: "てある는 결과 상태가 놓여 있음, ておく는 내가 미리 준비함입니다.",
    answer: "미리 ~해 두다",
    choices: ["미리 ~해 두다", "막 ~하려다", "~하지 말다", "~일 리 없다"],
  },
];

const readingItems: StudyItem[] = [
  {
    id: "r-notice",
    kind: "reading",
    title: "공지문 핵심 찾기",
    focus: "誰が・いつ・何を",
    jp: "明日の会議は午後二時から三階の会議室で行います。",
    furigana: "あしたの かいぎは ごごにじから さんかいの かいぎしつで おこないます。",
    ko: "내일 회의는 오후 2시부터 3층 회의실에서 진행합니다.",
    koreanHint: "한국어 공지문처럼 시간→장소→행동을 표시하세요. N3 독해는 긴 문장보다 정보 위치 싸움입니다.",
    pitfall: "から는 시작점입니다. 오후 2시에 끝난다는 뜻으로 착각하지 마세요.",
    answer: "오후 2시에 시작한다",
    choices: ["오후 2시에 시작한다", "오후 3시에 시작한다", "3시에 끝난다", "회의가 취소된다"],
  },
  {
    id: "r-email",
    kind: "reading",
    title: "메일 의도 파악",
    focus: "부탁 표현",
    jp: "資料を読んでから、ご意見を聞かせていただけませんか。",
    furigana: "しりょうを よんでから、ごいけんを きかせていただけませんか。",
    ko: "자료를 읽은 뒤 의견을 들려주시지 않겠습니까?",
    koreanHint: "한국어 비즈니스 메일의 ‘~해 주실 수 있을까요’와 같은 완곡한 부탁입니다.",
    pitfall: "いただけませんか는 부정 질문이지만 실제 뜻은 정중한 요청입니다. 한국어 직역으로 부정이라고 생각하면 틀립니다.",
    answer: "의견을 부탁한다",
    choices: ["의견을 부탁한다", "자료를 거절한다", "일정을 취소한다", "답장을 금지한다"],
  },
  {
    id: "r-reason",
    kind: "reading",
    title: "이유-결과 연결",
    focus: "ので / ため",
    jp: "台風のため、今日の授業はオンラインで行います。",
    furigana: "たいふうの ため、きょうの じゅぎょうは オンラインで おこないます。",
    ko: "태풍 때문에 오늘 수업은 온라인으로 진행합니다.",
    koreanHint: "한국어 공지의 ‘~로 인해’입니다. 원인 뒤에 실제 조치가 오는 구조를 표시하세요.",
    pitfall: "ため는 목적도 이유도 됩니다. 앞이 명사+の/과거 사실이면 이유일 가능성이 큽니다.",
    answer: "수업 방식이 온라인으로 바뀐다",
    choices: ["수업 방식이 온라인으로 바뀐다", "수업 시간이 길어진다", "태풍 수업을 한다", "온라인 수업이 취소된다"],
  },
  {
    id: "r-inference",
    kind: "reading",
    title: "숨은 결론 추론",
    focus: "しかし 뒤집기",
    jp: "駅から遠いです。しかし、家賃が安いので、この部屋に決めました。",
    furigana: "えきから とおいです。しかし、やちんが やすいので、この へやに きめました。",
    ko: "역에서 멉니다. 하지만 월세가 싸서 이 방으로 정했습니다.",
    koreanHint: "한국어 독해처럼 しかし 뒤가 글쓴이의 최종 선택을 이깁니다.",
    pitfall: "앞 문장만 보고 ‘선택하지 않았다’고 고르면 함정입니다. 역접 뒤 결론을 보세요.",
    answer: "월세가 싸서 방을 선택했다",
    choices: ["월세가 싸서 방을 선택했다", "역에서 가까워서 선택했다", "방을 아직 정하지 않았다", "월세가 비싸서 포기했다"],
  },
];

const listeningSeedItems: StudyItem[] = [
  {
    id: "l-station",
    kind: "listening",
    title: "역 안내 듣기",
    focus: "숫자와 목적지",
    jp: "次の電車は十時十五分発、京都行きです。",
    furigana: "つぎの でんしゃは じゅうじじゅうごふんはつ、きょうといきです。",
    ko: "다음 전철은 10시 15분 출발, 교토행입니다.",
    koreanHint: "일본어 시간은 숫자가 연달아 나와 한국어 학습자가 놓치기 쉽습니다. 発은 ‘출발’ 신호로 들으세요.",
    pitfall: "行き는 ‘가는 중’이 아니라 행선지 ‘~행’입니다.",
    answer: "10시 15분 교토행",
    choices: ["10시 15분 교토행", "10시 50분 도쿄행", "11시 15분 교토행", "10시 15분 오사카행"],
  },
  {
    id: "l-request",
    kind: "listening",
    title: "부탁 듣기",
    focus: "해야 할 행동",
    jp: "すみませんが、このコピーを五部お願いします。",
    furigana: "すみませんが、この コピーを ごぶ おねがいします。",
    ko: "죄송하지만 이 복사를 5부 부탁합니다.",
    koreanHint: "부탁 문장에서는 숫자+단위가 정답입니다. 五部는 ‘다섯 부’로 통째로 외우세요.",
    pitfall: "ごぶ를 ‘5분’처럼 듣지 마세요. 部는 문서 부수입니다.",
    answer: "복사 5부",
    choices: ["복사 5부", "복사 5분", "책 5권", "메일 5통"],
  },
  {
    id: "l-price",
    kind: "listening",
    title: "가격 듣기",
    focus: "할인 후 금액",
    jp: "この辞書は二千円ですが、学生は五百円安くなります。",
    furigana: "この じしょは にせんえんですが、がくせいは ごひゃくえん やすくなります。",
    ko: "이 사전은 2,000엔이지만 학생은 500엔 싸집니다.",
    koreanHint: "청해 가격 문제는 원래 가격보다 ‘얼마를 내는지’가 핵심입니다. 2,000-500=1,500을 바로 계산하세요.",
    pitfall: "安くなります는 할인 금액이 아니라 싸진 결과입니다. 문제에서 최종 가격을 물을 수 있습니다.",
    answer: "학생은 1,500엔",
    choices: ["학생은 1,500엔", "학생은 2,500엔", "학생은 500엔", "학생은 2,000엔"],
  },
  {
    id: "l-order",
    kind: "listening",
    title: "순서 듣기",
    focus: "먼저/다음에",
    jp: "まず申込書を書いて、それから受付に出してください。",
    furigana: "まず もうしこみしょを かいて、それから うけつけに だしてください。",
    ko: "먼저 신청서를 쓰고, 그다음 접수처에 제출해 주세요.",
    koreanHint: "まず와 それから는 한국어 ‘먼저/그다음’과 같습니다. 행동 순서를 숫자로 적으면 틀릴 확률이 줄어듭니다.",
    pitfall: "受付に出す는 ‘접수처로 나가다’가 아니라 ‘접수처에 제출하다’입니다.",
    answer: "신청서를 쓰고 제출한다",
    choices: ["신청서를 쓰고 제출한다", "접수 후 신청서를 받는다", "신청서를 읽고 버린다", "접수처를 먼저 찾지 않는다"],
  },
];

const listeningScenarioSeeds = [
  ["버스 안내", "乗客の皆様、次の停留所は市役所前です。降りる方はボタンを押してください。", "じょうきゃくの みなさま、つぎの ていりゅうじょは しやくしょまえです。おりる かたは ボタンを おしてください。", "승객 여러분, 다음 정류장은 시청 앞입니다. 내리실 분은 버튼을 눌러 주세요.", "다음 정류장은 시청 앞", "도서관 앞", "학교 정문", "공항 터미널", "장소 안내"],
  ["회의 변경", "今日の会議は三時から四時半に変わりました。場所は二階の会議室です。", "きょうの かいぎは さんじから よじはんに かわりました。ばしょは にかいの かいぎしつです。", "오늘 회의는 3시에서 4시 반으로 바뀌었습니다. 장소는 2층 회의실입니다.", "4시 반, 2층 회의실", "3시, 1층 로비", "4시, 온라인", "5시 반, 교실", "시간 변경"],
  ["분실물 문의", "黒い傘をなくしました。駅の受付で聞いてみてください。", "くろい かさを なくしました。えきの うけつけで きいてみてください。", "검은 우산을 잃어버렸습니다. 역 접수처에 물어보세요.", "역 접수처에 문의한다", "새 우산을 산다", "교실에서 기다린다", "친구에게 빌린다", "해야 할 행동"],
  ["숙제 안내", "作文は金曜日までにメールで提出してください。紙で出さなくてもいいです。", "さくぶんは きんようびまでに メールで ていしゅつしてください。かみで ださなくてもいいです。", "작문은 금요일까지 메일로 제출해 주세요. 종이로 내지 않아도 됩니다.", "금요일까지 메일 제출", "목요일까지 종이 제출", "금요일에 직접 제출", "다음 주 온라인 시험", "제출 조건"],
  ["날씨 안내", "午後から雨が強くなるそうです。外に出る人は傘を持って行ってください。", "ごごから あめが つよくなるそうです。そとに でる ひとは かさを もっていってください。", "오후부터 비가 강해진다고 합니다. 밖에 나가는 사람은 우산을 가져가세요.", "오후에 비가 강해진다", "아침부터 눈이 온다", "하루 종일 맑다", "밤에 바람이 멈춘다", "날씨 정보"],
  ["도서관 안내", "図書館は月曜日休みです。返す本は入口の箱に入れてください。", "としょかんは げつようび やすみです。かえす ほんは いりぐちの はこに いれてください。", "도서관은 월요일 휴관입니다. 반납할 책은 입구 상자에 넣어 주세요.", "입구 상자에 반납한다", "월요일에 데스크로 간다", "책을 집에 보관한다", "온라인으로 예약한다", "시설 안내"],
  ["가게 예약", "予約は七時です。名前を言ってから、窓側の席に座ってください。", "よやくは しちじです。なまえを いってから、まどがわの せきに すわってください。", "예약은 7시입니다. 이름을 말한 뒤 창가 자리에 앉아 주세요.", "7시에 이름을 말한다", "6시에 계산한다", "7시 반에 주문한다", "창문을 닫는다", "예약 확인"],
  ["시험 준비", "試験の日は受験票と身分証を必ず持ってきてください。鉛筆は会場にあります。", "しけんの ひは じゅけんひょうと みぶんしょうを かならず もってきてください。えんぴつは かいじょうに あります。", "시험 날에는 수험표와 신분증을 반드시 가져오세요. 연필은 시험장에 있습니다.", "수험표와 신분증", "연필과 사전", "학생증과 우산", "신청서와 사진", "준비물"],
];

const generatedListeningItems: StudyItem[] = Array.from({ length: 32 }, (_, index) => {
  const seed = listeningScenarioSeeds[index % listeningScenarioSeeds.length];
  const round = Math.floor(index / listeningScenarioSeeds.length) + 1;
  const [title, jp, furigana, ko, answer, wrongA, wrongB, wrongC, focus] = seed;
  return {
    id: `listen-bank-${index + 1}`,
    kind: "listening" as const,
    title: `${title} ${round}`,
    focus: `${focus} · 청해 ${round}회차`,
    jp,
    furigana,
    ko,
    koreanHint: "청해는 숫자·시간·장소·해야 할 행동을 먼저 메모하면 한국어로 해석하기 전에 정답 단서가 보입니다.",
    pitfall: "비슷한 숫자와 장소 표현을 섞어 듣기 쉽습니다. 마지막 지시문보다 핵심 조건을 우선 확인하세요.",
    answer,
    choices: shuffleChoices([answer, wrongA, wrongB, wrongC], `listen-bank-${index + 1}`),
  };
});

const listeningItems: StudyItem[] = [...listeningSeedItems, ...generatedListeningItems];


const n3VocabSeeds = [
  ["合格", "ごうかく", "합격", "試験に合格するために、毎日練習しています。", "しけんに ごうかくするために、まいにち れんしゅうしています。", "시험에 합격하기 위해 매일 연습하고 있습니다."],
  ["失敗", "しっぱい", "실패", "失敗しても、理由を確認すれば次に進めます。", "しっぱいしても、りゆうを かくにんすれば つぎに すすめます。", "실패해도 이유를 확인하면 다음으로 나아갈 수 있습니다."],
  ["準備", "じゅんび", "준비", "授業の前に資料を準備しておきます。", "じゅぎょうの まえに しりょうを じゅんびしておきます。", "수업 전에 자료를 미리 준비해 둡니다."],
  ["予約", "よやく", "예약", "週末のホテルを予約しました。", "しゅうまつの ホテルを よやくしました。", "주말 호텔을 예약했습니다."],
  ["予定", "よてい", "예정", "明日の予定をもう一度確認します。", "あしたの よていを もういちど かくにんします。", "내일 예정을 한 번 더 확인합니다."],
  ["連絡", "れんらく", "연락", "遅れる場合は、先生に連絡してください。", "おくれる ばあいは、せんせいに れんらくしてください。", "늦는 경우에는 선생님께 연락해 주세요."],
  ["相談", "そうだん", "상담", "困ったときは友達に相談します。", "こまったときは ともだちに そうだんします。", "곤란할 때는 친구에게 상담합니다."],
  ["経験", "けいけん", "경험", "海外で働いた経験があります。", "かいがいで はたらいた けいけんが あります。", "해외에서 일한 경험이 있습니다."],
  ["原因", "げんいん", "원인", "間違いの原因を調べました。", "まちがいの げんいんを しらべました。", "실수의 원인을 조사했습니다."],
  ["結果", "けっか", "결과", "努力の結果、点数が上がりました。", "どりょくの けっか、てんすうが あがりました。", "노력의 결과 점수가 올랐습니다."],
  ["必要", "ひつよう", "필요", "申込には写真が必要です。", "もうしこみには しゃしんが ひつようです。", "신청에는 사진이 필요합니다."],
  ["十分", "じゅうぶん", "충분", "復習の時間は十分あります。", "ふくしゅうの じかんは じゅうぶん あります。", "복습 시간은 충분히 있습니다."],
  ["安全", "あんぜん", "안전", "安全のため、ここで待ってください。", "あんぜんのため、ここで まってください。", "안전을 위해 여기서 기다려 주세요."],
  ["危険", "きけん", "위험", "この道は夜になると危険です。", "この みちは よるに なると きけんです。", "이 길은 밤이 되면 위험합니다."],
  ["普通", "ふつう", "보통", "普通は十分前に着きます。", "ふつうは じゅっぷんまえに つきます。", "보통은 10분 전에 도착합니다."],
  ["急に", "きゅうに", "갑자기", "急に雨が降り始めました。", "きゅうに あめが ふりはじめました。", "갑자기 비가 내리기 시작했습니다."],
  ["特に", "とくに", "특히", "漢字は特に注意してください。", "かんじは とくに ちゅういしてください。", "한자는 특히 주의해 주세요."],
  ["必ず", "かならず", "반드시", "試験の日は必ず身分証を持ってきてください。", "しけんの ひは かならず みぶんしょうを もってきてください。", "시험 날에는 반드시 신분증을 가져오세요."],
  ["なるべく", "なるべく", "되도록", "なるべく早く返事をします。", "なるべく はやく へんじを します。", "되도록 빨리 답장하겠습니다."],
  ["だんだん", "だんだん", "점점", "日本語の音にだんだん慣れてきました。", "にほんごの おとに だんだん なれてきました。", "일본어 소리에 점점 익숙해졌습니다."],
  ["増える", "ふえる", "늘다", "読める漢字が増えました。", "よめる かんじが ふえました。", "읽을 수 있는 한자가 늘었습니다."],
  ["減る", "へる", "줄다", "練習すると間違いが減ります。", "れんしゅうすると まちがいが へります。", "연습하면 실수가 줄어듭니다."],
  ["直す", "なおす", "고치다", "間違えた文をすぐ直しました。", "まちがえた ぶんを すぐ なおしました。", "틀린 문장을 바로 고쳤습니다."],
  ["治る", "なおる", "낫다", "薬を飲んだら風邪が治りました。", "くすりを のんだら かぜが なおりました。", "약을 먹었더니 감기가 나았습니다."],
  ["決める", "きめる", "정하다", "週末に受ける模試を決めました。", "しゅうまつに うける もしを きめました。", "주말에 볼 모의고사를 정했습니다."],
  ["決まる", "きまる", "정해지다", "試験の時間が決まりました。", "しけんの じかんが きまりました。", "시험 시간이 정해졌습니다."],
  ["届ける", "とどける", "전달하다", "受付に書類を届けます。", "うけつけに しょるいを とどけます。", "접수처에 서류를 전달합니다."],
  ["届く", "とどく", "도착하다", "昨日送った荷物が届きました。", "きのう おくった にもつが とどきました。", "어제 보낸 짐이 도착했습니다."],
  ["比べる", "くらべる", "비교하다", "二つの表現を比べて覚えます。", "ふたつの ひょうげんを くらべて おぼえます。", "두 표현을 비교해서 외웁니다."],
  ["選ぶ", "えらぶ", "고르다", "正しい答えを選んでください。", "ただしい こたえを えらんでください。", "올바른 답을 골라 주세요."],
  ["間に合う", "まにあう", "시간에 대다", "急げば授業に間に合います。", "いそげば じゅぎょうに まにあいます。", "서두르면 수업 시간에 맞출 수 있습니다."],
  ["遅れる", "おくれる", "늦다", "電車が遅れて、会議に遅れました。", "でんしゃが おくれて、かいぎに おくれました。", "전철이 늦어 회의에 늦었습니다."],
  ["戻る", "もどる", "돌아가다", "忘れ物を取りに家へ戻りました。", "わすれものを とりに いえへ もどりました。", "두고 온 물건을 가지러 집에 돌아갔습니다."],
  ["向かう", "むかう", "향하다", "駅に向かって歩いています。", "えきに むかって あるいています。", "역으로 향해 걷고 있습니다."],
  ["通う", "かよう", "다니다", "日本語学校に通っています。", "にほんごがっこうに かよっています。", "일본어 학교에 다니고 있습니다."],
  ["慣れる", "なれる", "익숙해지다", "日本語の速さに慣れてきました。", "にほんごの はやさに なれてきました。", "일본어 속도에 익숙해졌습니다."],
  ["苦手", "にがて", "서툴다", "助詞の使い方が苦手です。", "じょしの つかいかたが にがてです。", "조사 쓰는 법이 약합니다."],
  ["得意", "とくい", "잘하다", "漢字を読むのが得意です。", "かんじを よむのが とくいです。", "한자를 읽는 것을 잘합니다."],
  ["遠慮", "えんりょ", "삼감/사양", "ここでの飲食はご遠慮ください。", "ここでの いんしょくは ごえんりょください。", "여기에서 음식물 섭취는 삼가 주세요."],
  ["申込", "もうしこみ", "신청", "模試の申込は今日までです。", "もしの もうしこみは きょうまでです。", "모의고사 신청은 오늘까지입니다."],
  ["受付", "うけつけ", "접수", "受付で名前を書いてください。", "うけつけで なまえを かいてください。", "접수처에서 이름을 써 주세요."],
  ["会場", "かいじょう", "시험장/장소", "試験会場までの道を確認しました。", "しけんかいじょうまでの みちを かくにんしました。", "시험장까지 가는 길을 확인했습니다."],
  ["説明", "せつめい", "설명", "先生が文法を説明しました。", "せんせいが ぶんぽうを せつめいしました。", "선생님이 문법을 설명했습니다."],
  ["復習", "ふくしゅう", "복습", "寝る前に今日の文法を復習します。", "ねるまえに きょうの ぶんぽうを ふくしゅうします。", "자기 전에 오늘의 문법을 복습합니다."],
  ["予習", "よしゅう", "예습", "明日の授業を予習しておきます。", "あしたの じゅぎょうを よしゅうしておきます。", "내일 수업을 예습해 둡니다."],
  ["提出", "ていしゅつ", "제출", "宿題をメールで提出しました。", "しゅくだいを メールで ていしゅつしました。", "숙제를 메일로 제출했습니다."],
  ["参加", "さんか", "참가", "週末の勉強会に参加します。", "しゅうまつの べんきょうかいに さんかします。", "주말 스터디에 참가합니다."],
  ["欠席", "けっせき", "결석", "熱があるので授業を欠席します。", "ねつが あるので じゅぎょうを けっせきします。", "열이 있어서 수업에 결석합니다."],
  ["出席", "しゅっせき", "출석", "会議に出席する予定です。", "かいぎに しゅっせきする よていです。", "회의에 참석할 예정입니다."],
  ["確認", "かくにん", "확인", "答えを確認してから次に進みます。", "こたえを かくにんしてから つぎに すすみます。", "답을 확인한 뒤 다음으로 넘어갑니다."],
  ["調べる", "しらべる", "찾아보다", "知らない言葉を辞書で調べます。", "しらない ことばを じしょで しらべます。", "모르는 단어를 사전에서 찾아봅니다."],
  ["探す", "さがす", "찾다", "なくした受験票を探しています。", "なくした じゅけんひょうを さがしています。", "잃어버린 수험표를 찾고 있습니다."],
  ["知らせる", "しらせる", "알리다", "結果が出たらすぐ知らせます。", "けっかが でたら すぐ しらせます。", "결과가 나오면 바로 알리겠습니다."],
  ["伝える", "つたえる", "전하다", "先生に欠席の理由を伝えました。", "せんせいに けっせきの りゆうを つたえました。", "선생님께 결석 이유를 전했습니다."],
  ["頼む", "たのむ", "부탁하다", "友達に録音を頼みました。", "ともだちに ろくおんを たのみました。", "친구에게 녹음을 부탁했습니다."],
  ["断る", "ことわる", "거절하다", "予定があるので誘いを断りました。", "よていが あるので さそいを ことわりました。", "예정이 있어서 권유를 거절했습니다."],
  ["誘う", "さそう", "권유하다", "友達を勉強会に誘いました。", "ともだちを べんきょうかいに さそいました。", "친구를 스터디에 권했습니다."],
  ["招待", "しょうたい", "초대", "先生を発表会に招待しました。", "せんせいを はっぴょうかいに しょうたいしました。", "선생님을 발표회에 초대했습니다."],
  ["案内", "あんない", "안내", "駅まで案内しましょうか。", "えきまで あんないしましょうか。", "역까지 안내해 드릴까요?"],
  ["利用", "りよう", "이용", "図書館をよく利用します。", "としょかんを よく りようします。", "도서관을 자주 이용합니다."],
  ["生活", "せいかつ", "생활", "日本での生活に慣れました。", "にほんでの せいかつに なれました。", "일본 생활에 익숙해졌습니다."],
  ["文化", "ぶんか", "문화", "日本の文化について発表します。", "にほんの ぶんかについて はっぴょうします。", "일본 문화에 대해 발표합니다."],
  ["習慣", "しゅうかん", "습관", "毎日読む習慣を作ります。", "まいにち よむ しゅうかんを つくります。", "매일 읽는 습관을 만듭니다."],
  ["関係", "かんけい", "관계", "この二つの文の関係を考えます。", "この ふたつの ぶんの かんけいを かんがえます。", "이 두 문장의 관계를 생각합니다."],
  ["場合", "ばあい", "경우", "遅れる場合は連絡してください。", "おくれる ばあいは れんらくしてください。", "늦는 경우에는 연락해 주세요."],
  ["途中", "とちゅう", "도중", "授業の途中で質問しました。", "じゅぎょうの とちゅうで しつもんしました。", "수업 도중에 질문했습니다."],
  ["最初", "さいしょ", "처음", "最初はひらがなから覚えます。", "さいしょは ひらがなから おぼえます。", "처음에는 히라가나부터 외웁니다."],
  ["最後", "さいご", "마지막", "最後に答えを確認します。", "さいごに こたえを かくにんします。", "마지막에 답을 확인합니다."],
  ["以上", "いじょう", "이상", "三十点以上が必要です。", "さんじゅってん いじょうが ひつようです。", "30점 이상이 필요합니다."],
  ["以下", "いか", "이하", "二十分以下で読んでください。", "にじゅっぷん いかで よんでください。", "20분 이하로 읽어 주세요."],
  ["以内", "いない", "이내", "一週間以内に返事をください。", "いっしゅうかん いないに へんじを ください。", "일주일 이내에 답장을 주세요."],
  ["以外", "いがい", "이외", "辞書以外は使えません。", "じしょ いがいは つかえません。", "사전 이외는 사용할 수 없습니다."],
  ["割合", "わりあい", "비율", "正解の割合が上がりました。", "せいかいの わりあいが あがりました。", "정답 비율이 올랐습니다."],
  ["程度", "ていど", "정도", "N3程度の文を読みます。", "エヌさん ていどの ぶんを よみます。", "N3 정도의 문장을 읽습니다."],
  ["機会", "きかい", "기회", "話す機会を増やしたいです。", "はなす きかいを ふやしたいです。", "말할 기회를 늘리고 싶습니다."],
  ["能力", "のうりょく", "능력", "読む能力を高めます。", "よむ のうりょくを たかめます。", "읽는 능력을 높입니다."],
  ["知識", "ちしき", "지식", "文法の知識を整理します。", "ぶんぽうの ちしきを せいりします。", "문법 지식을 정리합니다."],
  ["理解", "りかい", "이해", "例文を読んで意味を理解します。", "れいぶんを よんで いみを りかいします。", "예문을 읽고 의미를 이해합니다."],
  ["表現", "ひょうげん", "표현", "似ている表現を比べます。", "にている ひょうげんを くらべます。", "비슷한 표현을 비교합니다."],
  ["発音", "はつおん", "발음", "発音を聞いてまねします。", "はつおんを きいて まねします。", "발음을 듣고 따라 합니다."],
  ["練習", "れんしゅう", "연습", "毎日少しずつ練習します。", "まいにち すこしずつ れんしゅうします。", "매일 조금씩 연습합니다."],
  ["努力", "どりょく", "노력", "努力すれば必ず伸びます。", "どりょくすれば かならず のびます。", "노력하면 반드시 성장합니다."],
  ["注意", "ちゅうい", "주의", "似た言葉に注意してください。", "にた ことばに ちゅういしてください。", "비슷한 단어에 주의해 주세요."],
  ["興味", "きょうみ", "흥미", "日本のニュースに興味があります。", "にほんの ニュースに きょうみが あります。", "일본 뉴스에 흥미가 있습니다."],
  ["感動", "かんどう", "감동", "合格の知らせを聞いて感動しました。", "ごうかくの しらせを きいて かんどうしました。", "합격 소식을 듣고 감동했습니다."],
  ["安心", "あんしん", "안심", "準備が終わって安心しました。", "じゅんびが おわって あんしんしました。", "준비가 끝나 안심했습니다."],
  ["心配", "しんぱい", "걱정", "明日の試験が心配です。", "あしたの しけんが しんぱいです。", "내일 시험이 걱정됩니다."],
  ["残念", "ざんねん", "아쉬움", "点数が少し足りなくて残念でした。", "てんすうが すこし たりなくて ざんねんでした。", "점수가 조금 부족해서 아쉬웠습니다."],
  ["便利", "べんり", "편리", "このアプリは復習に便利です。", "この アプリは ふくしゅうに べんりです。", "이 앱은 복습에 편리합니다."],
  ["不便", "ふべん", "불편", "駅から遠くて少し不便です。", "えきから とおくて すこし ふべんです。", "역에서 멀어서 조금 불편합니다."],
  ["簡単", "かんたん", "간단", "最初の問題は簡単です。", "さいしょの もんだいは かんたんです。", "첫 문제는 간단합니다."],
  ["複雑", "ふくざつ", "복잡", "この文の関係は複雑です。", "この ぶんの かんけいは ふくざつです。", "이 문장의 관계는 복잡합니다."],
  ["正確", "せいかく", "정확", "正確に答えを選びます。", "せいかくに こたえを えらびます。", "정확하게 답을 고릅니다."],
  ["自然", "しぜん", "자연스러움", "自然な日本語で言ってください。", "しぜんな にほんごで いってください。", "자연스러운 일본어로 말해 주세요."],
  ["確か", "たしか", "확실", "確か、試験は九時からです。", "たしか、しけんは くじからです。", "확실히/아마 시험은 9시부터입니다."],
  ["ほとんど", "ほとんど", "거의", "この単語はほとんど覚えました。", "この たんごは ほとんど おぼえました。", "이 단어는 거의 외웠습니다."],
  ["なかなか", "なかなか", "좀처럼", "漢字がなかなか覚えられません。", "かんじが なかなか おぼえられません。", "한자가 좀처럼 외워지지 않습니다."],
  ["もし", "もし", "만약", "もし分からなければ質問してください。", "もし わからなければ しつもんしてください。", "만약 모르겠으면 질문해 주세요."],
  ["たとえば", "たとえば", "예를 들면", "たとえば、この文を見てください。", "たとえば、この ぶんを みてください。", "예를 들면 이 문장을 봐 주세요."],
  ["つまり", "つまり", "즉", "つまり、毎日続けることが大切です。", "つまり、まいにち つづけることが たいせつです。", "즉 매일 계속하는 것이 중요합니다."],
  ["ところで", "ところで", "그런데", "ところで、模試の結果はどうでしたか。", "ところで、もしの けっかは どうでしたか。", "그런데 모의고사 결과는 어땠습니까?"],
];

const distractors = ["확인", "예약", "걱정", "준비", "증가", "감소", "참가", "거절", "설명", "복습", "제출", "경험", "원인", "결과", "안내", "신청", "주의", "능력", "표현", "발음"];

const expandedVocabItems: StudyItem[] = Array.from({ length: 1040 }, (_, index) => {
  const seed = n3VocabSeeds[index % n3VocabSeeds.length];
  const [title, reading, answer, jp, furigana, ko] = seed;
  const wrong = distractors.filter((word) => word !== answer);
  const choices = shuffleChoices([answer, wrong[index % wrong.length], wrong[(index + 7) % wrong.length], wrong[(index + 13) % wrong.length]], `n3-vocab-${index}`);
  return {
    id: `bank-vocab-${index + 1}`,
    kind: "vocab",
    title,
    jlptLevel: "N3",
    focus: `${answer} · N3 빈출 ${Math.floor(index / n3VocabSeeds.length) + 1}회차`,
    jp,
    furigana: `${reading}｜${furigana}`,
    ko,
    koreanHint: "한국어 화자는 한자 뜻을 먼저 추측한 뒤 일본어 발음을 따로 고정하면 속도가 빠릅니다. 보기 뜻이 비슷하면 조사와 함께 쓰인 예문을 기준으로 고르세요.",
    pitfall: "한자어가 한국어와 닮아도 자동사/타동사, 신청/예약, 조사 に/を 차이에서 자주 틀립니다.",
    answer,
    choices,
  };
});

const n3CoreGrammarItems: StudyItem[] = [
  ...grammarItems,
  ...[
    ["Vる/Vない + ようになる", "~하게 되다", "毎日聞いていると、少しずつ分かるようになります。", "まいにち きいていると、すこしずつ わかるようになります。", "매일 듣고 있으면 조금씩 알게 됩니다.", "상태 변화"],
    ["Vる/Vない + ことになる", "~하게 되다", "来月から新しい教室で勉強することになりました。", "らいげつから あたらしい きょうしつで べんきょうすることに なりました。", "다음 달부터 새 교실에서 공부하게 되었습니다.", "외부 결정"],
    ["Vた + ばかり", "막 ~했다", "日本に来たばかりなので、まだ道が分かりません。", "にほんに きたばかりなので、まだ みちが わかりません。", "일본에 막 와서 아직 길을 모릅니다.", "시간 감각"],
    ["Vる + ところ", "막 ~하려는 참", "今から宿題を始めるところです。", "いまから しゅくだいを はじめるところです。", "지금부터 숙제를 시작하려는 참입니다.", "직전 타이밍"],
    ["Vた + ところ", "막 ~한 참", "先生にメールを送ったところです。", "せんせいに メールを おくったところです。", "선생님께 메일을 막 보낸 참입니다.", "직후 타이밍"],
    ["Vます + ながら", "~하면서", "音声を聞きながら例文を読みます。", "おんせいを ききながら れいぶんを よみます。", "음성을 들으면서 예문을 읽습니다.", "동시 동작"],
    ["Vて + ある", "~해져 있다", "机の上に名前が書いてあります。", "つくえの うえに なまえが かいてあります。", "책상 위에 이름이 써져 있습니다.", "결과 상태"],
    ["Vて + みる", "~해 보다", "分からない言葉を辞書で調べてみます。", "わからない ことばを じしょで しらべてみます。", "모르는 단어를 사전에서 찾아보겠습니다.", "시도"],
    ["Vて + くる", "~해 오다/변화해 오다", "日本語が少し分かってきました。", "にほんごが すこし わかってきました。", "일본어를 조금 알게 되어 왔습니다.", "변화 진행"],
    ["Vて + いく", "~해 가다", "これから語彙を増やしていきます。", "これから ごいを ふやしていきます。", "앞으로 어휘를 늘려 가겠습니다.", "앞으로 진행"],
    ["Vる + つもり", "~할 생각", "日曜日に模試を受けるつもりです。", "にちようびに もしを うけるつもりです。", "일요일에 모의고사를 볼 생각입니다.", "의도"],
    ["Vる + 予定", "~할 예정", "来週、結果が発表される予定です。", "らいしゅう、けっかが はっぴょうされる よていです。", "다음 주 결과가 발표될 예정입니다.", "일정"],
    ["Vる + べき", "~해야 한다", "間違えた問題はすぐ復習するべきです。", "まちがえた もんだいは すぐ ふくしゅうするべきです。", "틀린 문제는 바로 복습해야 합니다.", "당위"],
    ["Vる + ことがある", "~할 때가 있다", "疲れると、簡単な漢字を忘れることがあります。", "つかれると、かんたんな かんじを わすれることが あります。", "피곤하면 쉬운 한자를 잊을 때가 있습니다.", "가끔 발생"],
    ["Vた + ことがある", "~한 적이 있다", "日本語の試験を受けたことがあります。", "にほんごの しけんを うけたことが あります。", "일본어 시험을 본 적이 있습니다.", "경험"],
    ["普通形 + かもしれない", "~일지도 모른다", "この問題は試験に出るかもしれません。", "この もんだいは しけんに でるかもしれません。", "이 문제는 시험에 나올지도 모릅니다.", "약한 가능성"],
    ["普通形 + らしい", "~답다/~라고 한다", "彼は毎日三時間勉強しているらしいです。", "かれは まいにち さんじかん べんきょうしているらしいです。", "그는 매일 세 시간 공부한다고 합니다.", "전해 들은 정보"],
    ["普通形 + みたい", "~같다", "この文法は韓国語の表現みたいです。", "この ぶんぽうは かんこくごの ひょうげんみたいです。", "이 문법은 한국어 표현 같습니다.", "비유/판단"],
    ["AければAほど", "~하면 할수록", "練習すればするほど速く読めます。", "れんしゅうすれば するほど はやく よめます。", "연습하면 할수록 빨리 읽을 수 있습니다.", "비례"],
    ["Vる + ためには", "~하기 위해서는", "合格するためには、毎日解くことが大切です。", "ごうかくするためには、まいにち とくことが たいせつです。", "합격하기 위해서는 매일 푸는 것이 중요합니다.", "조건 목적"],
  ].map((row, index) => ({
    id: `core-grammar-${index + 1}`,
    kind: "grammar" as const,
    jlptLevel: "N3" as const,
    title: row[0],
    focus: row[1],
    jp: row[2],
    furigana: row[3],
    ko: row[4],
    koreanHint: `한국어식 감각: ${row[5]}로 기억하세요. 문장 끝 느낌을 먼저 잡으면 영어식 품사 분석보다 빠릅니다.`,
    pitfall: "한국어 번역이 비슷한 문형이 많으므로, 누가 결정했는지·근거가 있는지·시점이 언제인지를 먼저 보세요.",
    answer: row[1],
    choices: shuffleChoices([row[1], "~인데도", "~하기 위해서", "~하게 되다"], `core-grammar-${index}`),
  })),
];

const readingVariants = [
  { label: "쉬움", prefix: "", suffix: "", hint: "먼저 시간·장소·행동만 표시하세요." },
  { label: "보통", prefix: "", suffix: " そのため、答えを確認してから次に進んでください。", hint: "뒤 문장의 이유 연결을 확인하세요." },
  { label: "어려움", prefix: "以前は難しいと思っていましたが、", suffix: "", hint: "앞뒤 역접과 이유를 함께 보세요." },
  { label: "시간", prefix: "昨日の案内によると、", suffix: " 予定が変わる場合は受付に聞いてください。", hint: "시간 표현을 동그라미 치고 읽으세요." },
  { label: "장소", prefix: "駅から遠いですが、", suffix: " 場所を確認してから出発しましょう。", hint: "장소와 이동 동사를 먼저 찾으세요." },
  { label: "요청", prefix: "先生は学生に、", suffix: " と説明しました。", hint: "누가 누구에게 무엇을 부탁했는지 확인하세요." },
  { label: "이유", prefix: "台風のため、", suffix: " 理由を考えると答えが選びやすいです。", hint: "ため/ので 뒤의 결과를 연결하세요." },
  { label: "결론", prefix: "つまり、", suffix: " 最後の一文が結論です。", hint: "마지막 문장의 결론 단서를 보세요." },
] as const;

const levelReadingItems: StudyItem[] = readingItems.flatMap((item, index) =>
  readingVariants.map((variant, variantIndex) => ({
    ...item,
    id: `${item.id}-${variant.label}-${index}-${variantIndex}`,
    focus: `${variant.label} · ${item.focus}`,
    jp: `${variant.prefix}${item.jp}${variant.suffix}`,
    furigana: `${item.furigana}${variant.suffix ? " そのため、こたえを かくにんしてから つぎに すすんでください。" : ""}`,
    ko: item.ko,
    koreanHint: `${item.koreanHint} ${variant.hint}`,
    pitfall: variant.label === "어려움" ? `${item.pitfall} 어려움 문제는 앞뒤 역접과 이유를 함께 보세요.` : item.pitfall,
  }))
);

const allItems = [...expandedVocabItems, ...n3CoreGrammarItems, ...levelReadingItems, ...listeningItems];


const diagnosticQuestions: QuizQuestion[] = [
  ...allItems.slice(0, 10).map((item) => ({
    id: `d-${item.id}`,
    prompt: `${item.title}의 핵심 의미를 고르세요.`,
    example: { jp: item.jp, furigana: item.furigana, ko: item.ko },
    choices: item.choices,
    answer: item.answer,
    explanation: item.koreanHint,
    kind: "diagnostic" as const,
  })),
];

const plan = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1;
  const phase = day <= 7 ? "기초 생존" : day <= 18 ? "N3 핵심 패턴" : day <= 26 ? "실전 압축" : "파이널 점검";
  const focus = day % 5 === 1 ? "진단+어휘" : day % 5 === 2 ? "문법 비교" : day % 5 === 3 ? "독해 정보 찾기" : day % 5 === 4 ? "청해 숫자·부탁" : "오답 회수";
  return {
    day,
    phase,
    focus,
    mission: [
      "오늘의 예문 6개를 소리 내어 3회 읽기",
      "퀴즈에서 틀린 문항은 오답노트에 남기기",
      "한국어식 직역이 아니라 일본어 덩어리로 다시 말하기",
    ],
  };
});


const zeroBaseRules = [
  { title: "한자는 한국어 힌트로 추측", body: "確認·資料·試験처럼 한국어 한자어와 닮은 단어는 뜻을 먼저 잡고, 일본어 발음은 음성 버튼으로 따로 고정합니다." },
  { title: "조사는 번역하지 말고 역할 표시", body: "は=화제, が=새 정보/주어, を=대상, に=도착점·시간, で=장소·수단으로 색칠하듯 체크하세요." },
  { title: "문법은 한국어 문장 끝으로 기억", body: "のに=‘했는데도 왜?’, はず=‘근거상 당연히’, ておく=‘미리 해 두다’처럼 한국어 감정선으로 저장합니다." },
];

const cramBlocks = ["아침 7분: 음성 듣고 따라 읽기", "점심 8분: 어휘·문법 6카드", "저녁 10분: 오답+독해/청해 2문항"];

const nav: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "홈", icon: "🔥" },
  { id: "free", label: "문제", icon: "∞" },
  { id: "vocab", label: "어휘", icon: "🧠" },
  { id: "grammar", label: "문법", icon: "🔗" },
  { id: "reading", label: "독해", icon: "📖" },
  { id: "listening", label: "청해", icon: "🎧" },
  { id: "wrong", label: "오답", icon: "📝" },
  { id: "dashboard", label: "기록", icon: "📊" },
];

function useProgress() {
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("n3-cram-progress");
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<Progress>;
        setProgress({
          ...defaultProgress,
          ...saved,
          statsByKind: { ...defaultProgress.statsByKind, ...(saved.statsByKind ?? {}) },
          furiganaMode: saved.furiganaMode ?? (saved.showFurigana === false ? "hidden" : "exam"),
          darkMode: saved.darkMode ?? false,
        });
      } catch {
        setProgress(defaultProgress);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("n3-cram-progress", JSON.stringify(progress));
  }, [hydrated, progress]);

  return [progress, setProgress] as const;
}

async function speakJapanese(text: string, onBlocked?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onBlocked?.();
    return;
  }
  try {
    const voices = await getVoicesWhenReady();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.86;
    utterance.pitch = 1.02;
    const voice = voices.find((candidate) => candidate.lang.toLowerCase().startsWith("ja"));
    if (voice) utterance.voice = voice;
    utterance.onerror = () => onBlocked?.();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) onBlocked?.();
    }, 500);
  } catch {
    onBlocked?.();
  }
}

function ExampleCard({ example, compact = false, furiganaMode = "exam", revealed = false, answerTerm, onAudioBlocked }: { example: Example; compact?: boolean; furiganaMode?: FuriganaMode; revealed?: boolean; answerTerm?: string; onAudioBlocked?: () => void }) {
  const showFullFurigana = revealed || furiganaMode === "learning";
  return (
    <div className="rounded-3xl border border-orange-100 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${compact ? "text-lg" : "text-xl"} japanese-line font-black leading-relaxed text-slate-950`}>{renderJapaneseWithRuby(example.jp, furiganaMode, revealed, answerTerm)}</p>
          {showFullFurigana && <p className="ruby mt-1 text-xs font-bold text-rose-700">{example.furigana}</p>}
        </div>
        <button
          type="button"
          onClick={() => speakJapanese(example.jp, onAudioBlocked)}
          className="shrink-0 rounded-full bg-orange-500 px-3 py-2 text-sm font-black text-white shadow-lg shadow-orange-200 active:scale-95"
          aria-label="일본어 음성 듣기"
        >
          🔊
        </button>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/85 p-3 text-center shadow-sm ring-1 ring-orange-100">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function updateStudyProgress(progress: Progress, item: StudyItem, correct: boolean): Progress {
  const current = progress.srs[item.id] ?? { ease: 2, due: todayIso(), seen: 0, correct: 0, level: "new" as Level };
  const seen = current.seen + 1;
  const correctCount = current.correct + (correct ? 1 : 0);
  const ease = Math.max(1, Math.min(5, current.ease + (correct ? 1 : -1)));
  const interval = correct ? Math.min(14, ease * Math.max(1, seen - 1)) : 1;
  const level: Level = correctCount >= 4 ? "mastered" : seen >= 2 ? "review" : "learning";
  const baseStats = progress.statsByKind ?? defaultProgress.statsByKind;
  const currentKindStats = baseStats[item.kind] ?? { answered: 0, correct: 0 };
  const last = progress.lastStudyDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const newStreak = last === todayIso() ? progress.streak : last === yesterday.toISOString().slice(0, 10) ? progress.streak + 1 : 1;

  return {
    ...progress,
    xp: progress.xp + (correct ? 12 : 6),
    streak: newStreak,
    lastStudyDate: todayIso(),
    totalAnswered: (progress.totalAnswered ?? 0) + 1,
    totalCorrect: (progress.totalCorrect ?? 0) + (correct ? 1 : 0),
    todayAnswered: last === todayIso() ? (progress.todayAnswered ?? 0) + 1 : 1,
    todayCorrect: last === todayIso() ? (progress.todayCorrect ?? 0) + (correct ? 1 : 0) : (correct ? 1 : 0),
    studySeconds: (progress.studySeconds ?? 0) + 35,
    recentIds: [item.id, ...(progress.recentIds ?? []).filter((id) => id !== item.id)].slice(0, 80),
    statsByKind: {
      ...baseStats,
      [item.kind]: { answered: currentKindStats.answered + 1, correct: currentKindStats.correct + (correct ? 1 : 0) },
    },
    srs: { ...progress.srs, [item.id]: { ease, due: addDays(interval), seen, correct: correctCount, level } },
  };
}

function addWrong(progress: Progress, entry: WrongEntry) {
  return { ...progress, wrong: [entry, ...progress.wrong.filter((old) => old.id !== entry.id)].slice(0, 80) };
}

function Trainer({ title, items, progress, setProgress, onAudioBlocked }: { title: string; items: StudyItem[]; progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; onAudioBlocked?: () => void }) {
  const [index, setIndex] = useState(0);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const item = items[index % items.length];
  const choices = useMemo(() => shuffleChoices(item.choices, item.id), [item.choices, item.id]);
  const srs = progress.srs[item.id];
  const correct = pendingChoice === item.answer;

  const confirmAnswer = () => {
    if (!pendingChoice || revealed) return;
    setRevealed(true);
    setProgress((prev) => {
      let next = updateStudyProgress(prev, item, pendingChoice === item.answer);
      if (pendingChoice !== item.answer) {
        next = addWrong(next, { id: `${item.id}-${Date.now()}`, title: item.title, correct: item.answer, chosen: pendingChoice, at: new Date().toISOString(), kind: item.kind });
      }
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-200">{title}</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-black">{item.title}</h2>
          <button type="button" onClick={() => speakJapanese(item.title, onAudioBlocked)} className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-orange-100">🔊 단어</button>
        </div>
        <p className="mt-1 text-sm text-slate-300">{item.focus}</p>
        <div className="mt-3 flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/10 px-3 py-1">SRS: {srs?.level ?? "new"}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">오늘 {progress.todayAnswered ?? 0}문제</span>
        </div>
      </div>

      <ExampleCard example={item} furiganaMode={progress.furiganaMode} revealed={revealed} answerTerm={item.kind === "vocab" ? item.title : undefined} onAudioBlocked={onAudioBlocked} />

      <div className="rounded-3xl bg-white/80 p-3 shadow-sm ring-1 ring-orange-100">
        <p className="px-1 pb-2 text-xs font-black text-slate-500">답을 먼저 고른 뒤 ‘정답 확인’을 눌러야 해설이 열립니다.</p>
        <div className="grid gap-2">
          {choices.map((choice, choiceIndex) => {
            const state = revealed && choice === item.answer
              ? "border-emerald-500 bg-emerald-50 text-emerald-950"
              : revealed && choice === pendingChoice
                ? "border-rose-500 bg-rose-50 text-rose-950"
                : pendingChoice === choice
                  ? "border-blue-500 bg-blue-50 text-blue-950"
                  : "border-slate-200 bg-white text-slate-800";
            return (
              <button key={`${choice}-${choiceIndex}`} type="button" disabled={revealed} onClick={() => setPendingChoice(choice)} className={`rounded-2xl border-2 p-4 text-left font-black shadow-sm active:scale-[0.99] disabled:opacity-100 ${state}`}>
                {choice}
              </button>
            );
          })}
        </div>
        {!revealed && (
          <button type="button" disabled={!pendingChoice} onClick={confirmAnswer} className="mt-3 w-full rounded-2xl bg-orange-500 py-3 font-black text-white shadow-lg shadow-orange-100 disabled:bg-slate-300 disabled:shadow-none">
            정답 확인
          </button>
        )}
      </div>

      {revealed && (
        <div className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className={`text-lg font-black ${correct ? "text-emerald-700" : "text-rose-700"}`}>{correct ? "정답! 바로 다음 복습 간격이 늘어났어요." : `오답: 정답은 ${item.answer}`}</p>
          <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-bold leading-6 text-orange-950">🇰🇷 해석: {item.ko}</p>
          <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">요미가나: {item.furigana}</p>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-700">💡 한국어식 감각: {item.koreanHint}</p>
          <p className="mt-2 text-sm font-bold leading-6 text-rose-800">⚠️ 자주 헷갈림: {item.pitfall}</p>
          <button type="button" onClick={() => { setPendingChoice(null); setRevealed(false); setIndex((value) => value + 1); }} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 font-black text-white">
            다음 카드
          </button>
        </div>
      )}
    </section>
  );
}

function Diagnostic({ progress, setProgress, onAudioBlocked }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; onAudioBlocked?: () => void }) {
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const score = diagnosticQuestions.filter((question) => answers[question.id] === question.answer).length;
  const done = Object.keys(answers).length === diagnosticQuestions.length;

  const confirmQuestion = (question: QuizQuestion) => {
    const choice = pendingAnswers[question.id];
    if (!choice || answers[question.id]) return;
    setAnswers((prev) => ({ ...prev, [question.id]: choice }));
    const isCorrect = choice === question.answer;
    setProgress((prev) => {
      const baseStats = prev.statsByKind ?? defaultProgress.statsByKind;
      const currentStats = baseStats.diagnostic ?? { answered: 0, correct: 0 };
      let next: Progress = {
        ...prev,
        xp: prev.xp + (isCorrect ? 12 : 6),
        lastStudyDate: todayIso(),
        totalAnswered: (prev.totalAnswered ?? 0) + 1,
        totalCorrect: (prev.totalCorrect ?? 0) + (isCorrect ? 1 : 0),
        todayAnswered: prev.lastStudyDate === todayIso() ? (prev.todayAnswered ?? 0) + 1 : 1,
        todayCorrect: prev.lastStudyDate === todayIso() ? (prev.todayCorrect ?? 0) + (isCorrect ? 1 : 0) : (isCorrect ? 1 : 0),
        studySeconds: (prev.studySeconds ?? 0) + 35,
        statsByKind: { ...baseStats, diagnostic: { answered: currentStats.answered + 1, correct: currentStats.correct + (isCorrect ? 1 : 0) } },
      };
      if (!isCorrect) next = addWrong(next, { id: `${question.id}-${Date.now()}`, title: question.prompt, correct: question.answer, chosen: choice, at: new Date().toISOString(), kind: "diagnostic" });
      return next;
    });
  };

  const saveScore = () => setProgress((prev) => ({ ...prev, diagnosticScore: Math.round((score / diagnosticQuestions.length) * 100), xp: prev.xp + score * 5 }));

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-orange-500 to-rose-600 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-100">10문항 빠른 진단</p>
        <h2 className="mt-1 text-2xl font-black">제로베이스 위치 확인</h2>
        <p className="mt-2 text-sm font-bold text-white/90">답을 고른 뒤 각 문항의 ‘정답 확인’을 눌러야 정답·오답과 해설이 보입니다.</p>
      </div>
      {diagnosticQuestions.map((question, idx) => {
        const selected = answers[question.id];
        const pending = pendingAnswers[question.id];
        const choices = shuffleChoices(question.choices, question.id);
        return (
          <div key={question.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
            <p className="mb-3 text-sm font-black text-slate-500">Q{idx + 1}. {question.prompt}</p>
            <ExampleCard example={question.example} compact furiganaMode={progress.furiganaMode} revealed={Boolean(selected)} onAudioBlocked={onAudioBlocked} />
            <div className="mt-3 grid gap-2">
              {choices.map((choice, choiceIndex) => {
                const state = selected && choice === question.answer
                  ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                  : selected === choice
                    ? "bg-rose-50 border-rose-500 text-rose-950"
                    : pending === choice
                      ? "bg-blue-50 border-blue-500 text-blue-950"
                      : "bg-slate-50 border-slate-200 text-slate-800";
                return <button key={`${choice}-${choiceIndex}`} type="button" disabled={Boolean(selected)} onClick={() => setPendingAnswers((prev) => ({ ...prev, [question.id]: choice }))} className={`rounded-2xl border-2 p-3 text-left font-black disabled:opacity-100 ${state}`}>{choice}</button>;
              })}
            </div>
            {!selected && (
              <button type="button" disabled={!pending} onClick={() => confirmQuestion(question)} className="mt-3 w-full rounded-2xl bg-orange-500 py-3 font-black text-white shadow-lg shadow-orange-100 disabled:bg-slate-300 disabled:shadow-none">
                정답 확인
              </button>
            )}
            {selected && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className={`font-black ${selected === question.answer ? "text-emerald-700" : "text-rose-700"}`}>{selected === question.answer ? "정답입니다." : `오답입니다. 정답: ${question.answer}`}</p>
                <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-bold leading-6 text-orange-950">🇰🇷 해석: {question.example.ko}</p>
                <p className="mt-2 rounded-2xl bg-slate-100 p-3 text-xs font-bold leading-5 text-slate-600">요미가나: {question.example.furigana}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{question.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" disabled={!done} onClick={saveScore} className="w-full rounded-2xl bg-slate-950 py-4 font-black text-white disabled:bg-slate-300">
        진단 결과 저장하기 ({score}/{diagnosticQuestions.length})
      </button>
    </section>
  );
}

function getAccuracy(progress: Progress) {
  return progress.totalAnswered ? Math.round((progress.totalCorrect / progress.totalAnswered) * 100) : 0;
}

function getLevel(progress: Progress) {
  return Math.max(1, Math.floor((progress.xp ?? 0) / 220) + 1);
}

function getWeakness(progress: Progress) {
  const entries = Object.entries(progress.statsByKind ?? defaultProgress.statsByKind)
    .filter(([kind]) => ["vocab", "grammar", "reading", "listening"].includes(kind))
    .map(([kind, stats]) => ({ kind, rate: stats.answered ? stats.correct / stats.answered : 1, answered: stats.answered }))
    .sort((a, b) => a.rate - b.rate || b.answered - a.answered);
  return entries[0]?.answered ? entries[0].kind : "vocab";
}

function pickAdaptiveItem(pool: StudyItem[], progress: Progress, salt: number, excludedIds: Set<string> = new Set(), previousId?: string) {
  const recent = new Set(progress.recentIds ?? []);
  const accuracy = getAccuracy(progress);
  const weak = getWeakness(progress);
  const targetPool = pool.filter((item) => (accuracy < 65 ? item.kind === weak || item.focus.includes("쉬움") : accuracy > 85 ? !item.focus.includes("쉬움") : true));
  const preferred = targetPool.length ? targetPool : pool;
  const withoutSession = preferred.filter((item) => !excludedIds.has(item.id) && item.id !== previousId);
  const withoutRecent = withoutSession.filter((item) => !recent.has(item.id));
  const withoutPrevious = preferred.filter((item) => item.id !== previousId);
  const source = withoutRecent.length ? withoutRecent : withoutSession.length ? withoutSession : withoutPrevious.length ? withoutPrevious : preferred;
  const seed = (progress.totalAnswered ?? 0) * 31 + salt * 17 + excludedIds.size * 13 + getChoiceSeed(weak);
  return source[Math.abs(seed) % source.length];
}

function BankMode({ title, pool, progress, setProgress, mode = "adaptive", onAudioBlocked }: { title: string; pool: StudyItem[]; progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; mode?: "adaptive" | "wrong" | "mock"; onAudioBlocked?: () => void }) {
  const [salt, setSalt] = useState(1);
  const [sessionSeenIds, setSessionSeenIds] = useState<Set<string>>(() => new Set());
  const [item, setItem] = useState(() => pickAdaptiveItem(pool, progress, salt));
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const choices = useMemo(() => shuffleChoices(item.choices, `${item.id}-${salt}`), [item, salt]);
  const correct = pendingChoice === item.answer;
  const accuracy = getAccuracy(progress);

  const confirm = () => {
    if (!pendingChoice || revealed) return;
    setRevealed(true);
    setProgress((prev) => {
      let next = updateStudyProgress(prev, item, pendingChoice === item.answer);
      if (pendingChoice !== item.answer) {
        next = addWrong(next, { id: `${item.id}-${Date.now()}`, title: item.title, correct: item.answer, chosen: pendingChoice, at: new Date().toISOString(), kind: item.kind });
      }
      return next;
    });
  };

  const next = () => {
    const nextSalt = salt + 1;
    const shouldAvoidSessionRepeats = mode !== "wrong";
    const nextSeenIds = shouldAvoidSessionRepeats ? new Set([...sessionSeenIds, item.id]) : sessionSeenIds;
    const exhausted = shouldAvoidSessionRepeats && nextSeenIds.size >= pool.length;
    const effectiveSeenIds = exhausted ? new Set<string>([item.id]) : nextSeenIds;
    setSalt(nextSalt);
    setSessionSeenIds(effectiveSeenIds);
    setItem(pickAdaptiveItem(pool, progress, nextSalt, effectiveSeenIds, item.id));
    setPendingChoice(null);
    setRevealed(false);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 to-orange-700 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-100">무제한 문제은행 · {mode === "wrong" ? "오답 재시험" : mode === "mock" ? "모의고사" : "자동 난이도"}</p>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
          <span className="rounded-2xl bg-white/10 p-2">오늘 {progress.todayAnswered ?? 0}문제</span>
          <span className="rounded-2xl bg-white/10 p-2">누적 {progress.totalAnswered ?? 0}문제</span>
          <span className="rounded-2xl bg-white/10 p-2">정답률 {accuracy}%</span>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase text-orange-600">{item.kind} · {item.focus}</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">{item.title}</h3>
          </div>
          <button type="button" onClick={() => speakJapanese(item.title, onAudioBlocked)} className="rounded-full bg-orange-500 px-3 py-2 text-xs font-black text-white shadow-sm shadow-orange-100">🔊 발음</button>
        </div>
      </div>

      <ExampleCard example={item} furiganaMode={progress.furiganaMode} revealed={revealed} answerTerm={item.kind === "vocab" ? item.title : undefined} onAudioBlocked={onAudioBlocked} />

      <div className="rounded-3xl bg-white/90 p-3 shadow-sm ring-1 ring-orange-100">
        <p className="px-1 pb-2 text-xs font-black text-slate-500">정답은 선택 전 절대 표시되지 않습니다. 답을 고른 뒤 확인하세요.</p>
        <div className="grid gap-2">
          {choices.map((choice, choiceIndex) => {
            const state = revealed && choice === item.answer
              ? "border-emerald-500 bg-emerald-50 text-emerald-950"
              : revealed && choice === pendingChoice
                ? "border-rose-500 bg-rose-50 text-rose-950"
                : pendingChoice === choice
                  ? "border-blue-500 bg-blue-50 text-blue-950"
                  : "border-slate-200 bg-white text-slate-800";
            return <button key={`${choice}-${choiceIndex}`} type="button" disabled={revealed} onClick={() => setPendingChoice(choice)} className={`rounded-2xl border-2 p-4 text-left font-black disabled:opacity-100 ${state}`}>{choice}</button>;
          })}
        </div>
        {!revealed ? <button type="button" disabled={!pendingChoice} onClick={confirm} className="mt-3 w-full rounded-2xl bg-orange-500 py-3 font-black text-white shadow-lg shadow-orange-100 disabled:bg-slate-300 disabled:shadow-none">정답 확인</button> : null}
      </div>

      {revealed && (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
          <p className={`text-lg font-black ${correct ? "text-emerald-700" : "text-rose-700"}`}>{correct ? "+12 XP 정답" : `+6 XP 오답 · 정답은 ${item.answer}`}</p>
          <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-bold leading-6 text-orange-950">🇰🇷 해석: {item.ko}</p>
          <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">요미가나: {item.furigana}</p>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-700">💡 {item.koreanHint}</p>
          <p className="mt-2 text-sm font-bold leading-6 text-rose-800">⚠️ {item.pitfall}</p>
          <button type="button" onClick={next} className="mt-4 w-full rounded-2xl bg-orange-500 py-3 font-black text-white">계속 풀기</button>
        </div>
      )}
    </section>
  );
}

function FreeStudy({ progress, setProgress, onAudioBlocked }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; onAudioBlocked?: () => void }) {
  const [scope, setScope] = useState<"all" | Skill>("all");
  const pool = scope === "all" ? allItems : allItems.filter((item) => item.kind === scope);
  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-orange-100">
        <p className="text-sm font-black text-slate-500">자유 학습 모드: 하루 제한 없이 수백 문제까지 계속 풉니다.</p>
        <div className="mt-3 grid grid-cols-5 gap-1">
          {(["all", "vocab", "grammar", "reading", "listening"] as const).map((kind) => <button key={kind} onClick={() => setScope(kind)} className={`rounded-xl px-2 py-2 text-xs font-black ${scope === kind ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{kind === "all" ? "전체" : kind}</button>)}
        </div>
      </div>
      <BankMode key={scope} title={scope === "all" ? "랜덤 JLPT N3 문제" : `랜덤 ${scope} 문제`} pool={pool} progress={progress} setProgress={setProgress} onAudioBlocked={onAudioBlocked} />
    </section>
  );
}

function MockExam({ progress, setProgress, onAudioBlocked }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; onAudioBlocked?: () => void }) {
  const mockPool = useMemo(() => [
    ...expandedVocabItems.slice(0, 20),
    ...n3CoreGrammarItems.slice(0, 14),
    ...levelReadingItems.slice(0, 8),
    ...listeningItems,
  ], []);
  return <BankMode title="JLPT N3 미니 모의고사" pool={mockPool} progress={progress} setProgress={setProgress} mode="mock" onAudioBlocked={onAudioBlocked} />;
}

function Today({ progress, setProgress, setTab }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; setTab: (tab: Tab) => void }) {
  const [showPlan, setShowPlan] = useState(false);
  const currentDay = Math.min(30, Math.max(1, Math.floor((Date.now() - new Date(progress.startedAt).getTime()) / 86400000) + 1));
  const todayPlan = plan[currentDay - 1];
  const completeToday = () => {
    setProgress((prev) => {
      const last = prev.lastStudyDate;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const newStreak = last === todayIso() ? prev.streak : last === yesterday.toISOString().slice(0, 10) ? prev.streak + 1 : 1;
      return { ...prev, streak: newStreak, lastStudyDate: todayIso(), xp: prev.xp + 30, completedDays: Array.from(new Set([...prev.completedDays, currentDay])) };
    });
  };

  const primaryActions: { label: string; helper: string; tab: Tab; style: string }[] = [
    { label: "무한 문제풀이", helper: "자동 난이도", tab: "free", style: "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-200" },
    { label: "랜덤 어휘", helper: "N3 단어 1000+", tab: "vocab", style: "bg-slate-950 text-white shadow-slate-300" },
    { label: "랜덤 문법", helper: "한국인 약점 우선", tab: "grammar", style: "bg-indigo-600 text-white shadow-indigo-200" },
    { label: "랜덤 독해", helper: "난이도 자동 조절", tab: "reading", style: "bg-emerald-600 text-white shadow-emerald-200" },
    { label: "오답 복습", helper: progress.wrong.length === 0 ? "아직 오답 없음" : `${progress.wrong.length}개 재시험`, tab: "wrong", style: "bg-gradient-to-br from-slate-950 to-orange-600 text-white shadow-orange-200" },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-slate-950 p-4 text-white shadow-xl">
        <p className="text-xs font-black text-orange-200">문제은행 홈 · Day {currentDay} 보조 플랜</p>
        <h2 className="mt-1 text-2xl font-black">오늘도 제한 없이 계속 풀기</h2>
        <p className="mt-2 text-xs font-bold leading-5 text-slate-200">30일 계획과 상관없이 원하는 만큼 문제를 풀고 XP를 누적하세요.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {primaryActions.map((action, index) => (
          <button key={action.tab} type="button" onClick={() => setTab(action.tab)} className={`rounded-3xl p-4 text-left shadow-lg active:scale-[0.99] ${action.style} ${index === 0 || action.tab === "wrong" ? "col-span-2" : ""}`}>
            <span className="block text-lg font-black">{action.label}</span>
            <span className="mt-1 block text-xs font-bold opacity-80">{action.helper}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatPill label="연속" value={`${progress.streak}일`} />
        <StatPill label="오늘" value={progress.todayAnswered ?? 0} />
        <StatPill label="정답률" value={`${getAccuracy(progress)}%`} />
      </div>

      <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-orange-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black">오늘의 25분 루틴</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">보조 루틴입니다. 문제은행을 먼저 풀어도 됩니다.</p>
          </div>
          <button type="button" onClick={completeToday} className="shrink-0 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">완료</button>
        </div>
        <div className="mt-3 grid gap-2">
          {cramBlocks.map((block) => <p key={block} className="rounded-2xl bg-rose-50 p-2 text-xs font-black text-rose-950">{block}</p>)}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <h3 className="text-lg font-black">제로베이스 한국어 화자 생존 규칙</h3>
        <div className="mt-3 grid gap-2">
          {zeroBaseRules.map((rule) => (
            <div key={rule.title} className="rounded-2xl bg-slate-50 p-3">
              <p className="font-black text-slate-950">{rule.title}</p>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-600">{rule.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <button type="button" onClick={() => setShowPlan((value) => !value)} className="flex w-full items-center justify-between text-left">
          <span>
            <span className="block text-lg font-black">학습 플랜 보기</span>
            <span className="text-xs font-bold text-slate-500">30일 계획은 필요할 때만 펼쳐 확인합니다.</span>
          </span>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-black text-orange-700">{showPlan ? "접기" : "펼치기"}</span>
        </button>
        {showPlan && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {plan.map((day) => (
              <div key={day.day} className={`rounded-2xl border p-3 ${progress.completedDays.includes(day.day) ? "border-emerald-300 bg-emerald-50" : day.day === currentDay ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-slate-50"}`}>
                <p className="text-xs font-black text-slate-500">Day {day.day} · {day.phase}</p>
                <p className="font-black text-slate-900">{day.focus}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WrongNotebook({ progress, setProgress, onAudioBlocked }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; onAudioBlocked?: () => void }) {
  const [retest, setRetest] = useState(false);
  const wrongPool = useMemo(() => {
    const titles = new Set(progress.wrong.map((entry) => entry.title));
    const corrects = new Set(progress.wrong.map((entry) => entry.correct));
    return allItems.filter((item) => titles.has(item.title) || corrects.has(item.answer)).slice(0, 120);
  }, [progress.wrong]);

  if (retest && wrongPool.length > 0) {
    return (
      <section className="space-y-4">
        <button type="button" onClick={() => setRetest(false)} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm ring-1 ring-orange-100">← 오답노트로 돌아가기</button>
        <BankMode title="틀린 문제만 재시험" pool={wrongPool} progress={progress} setProgress={setProgress} mode="wrong" onAudioBlocked={onAudioBlocked} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-orange-100">
        <h2 className="text-2xl font-black">오답노트</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">틀린 문제는 자동 저장됩니다. 오답만 다시 풀어 약점 유형을 빠르게 회수하세요.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={wrongPool.length === 0} onClick={() => setRetest(true)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">오답만 재시험</button>
          <button type="button" onClick={() => setProgress((prev) => ({ ...prev, wrong: [] }))} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">오답 비우기</button>
        </div>
      </div>
      {progress.wrong.length === 0 ? <p className="rounded-3xl bg-white p-6 text-center font-bold text-slate-500">아직 오답이 없습니다. 문제은행을 풀면 자동 저장됩니다.</p> : progress.wrong.map((entry) => (
        <div key={entry.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-rose-100">
          <p className="text-xs font-black uppercase text-rose-500">{entry.kind} · {new Date(entry.at).toLocaleDateString("ko-KR")}</p>
          <h3 className="mt-1 font-black text-slate-950">{entry.title}</h3>
          <p className="mt-2 text-sm font-bold text-slate-600">내 답: <span className="text-rose-700">{entry.chosen}</span></p>
          <p className="text-sm font-bold text-slate-600">정답: <span className="text-emerald-700">{entry.correct}</span></p>
        </div>
      ))}
    </section>
  );
}

function Dashboard({ progress }: { progress: Progress }) {
  const mastered = Object.values(progress.srs).filter((item) => item.level === "mastered").length;
  const reviewed = Object.values(progress.srs).length;
  const diagnostic = progress.diagnosticScore ?? 0;
  const passProbability = Math.min(96, Math.round(18 + diagnostic * 0.2 + (progress.totalAnswered ?? 0) * 0.08 + mastered * 1.5 + Math.min(progress.streak, 30) * 1.1 - progress.wrong.length * 0.12));
  const dueToday = allItems.filter((item) => !progress.srs[item.id] || progress.srs[item.id].due <= todayIso()).length;
  const level = getLevel(progress);
  const nextLevelXp = level * 220;
  const levelProgress = Math.min(100, Math.round(((progress.xp % 220) / 220) * 100));
  const studyMinutes = Math.round((progress.studySeconds ?? 0) / 60);
  const weakness = getWeakness(progress);

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 to-slate-700 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-200">문제은행 학습 대시보드</p>
        <h2 className="mt-2 text-5xl font-black">Lv.{level}</h2>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-orange-300" style={{ width: `${levelProgress}%` }} /></div>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-200">다음 레벨까지 {Math.max(0, nextLevelXp - progress.xp)} XP · 예상 합격 가능성 {passProbability}%</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatPill label="오늘 푼 문제" value={progress.todayAnswered ?? 0} />
        <StatPill label="누적 문제" value={progress.totalAnswered ?? 0} />
        <StatPill label="정답률" value={`${getAccuracy(progress)}%`} />
        <StatPill label="총 학습" value={`${studyMinutes}분`} />
        <StatPill label="오늘 복습" value={`${dueToday}개`} />
        <StatPill label="마스터" value={mastered} />
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <h3 className="text-lg font-black">약점 유형 분석: {weakness}</h3>
        <div className="mt-3 grid gap-2">
          {Object.entries(progress.statsByKind ?? defaultProgress.statsByKind).filter(([kind]) => ["vocab", "grammar", "reading", "listening"].includes(kind)).map(([kind, stats]) => (
            <div key={kind} className="rounded-2xl bg-slate-50 p-3">
              <div className="flex justify-between text-sm font-black"><span>{kind}</span><span>{stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-orange-500" style={{ width: `${stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <h3 className="text-lg font-black">한국어 화자 우선순위</h3>
        <ul className="mt-3 space-y-2 text-sm font-bold leading-6 text-slate-700">
          <li className="rounded-2xl bg-orange-50 p-3">1. のに, そうだ처럼 한국어 번역이 같아도 감정·근거가 다른 문법을 먼저 잡기</li>
          <li className="rounded-2xl bg-orange-50 p-3">2. 한자어는 의미 추측 후 예문 음성으로 실제 발음 고정하기</li>
          <li className="rounded-2xl bg-orange-50 p-3">3. 독해는 조사보다 시간·장소·요청 동사를 표시하며 풀기</li>
          <li className="rounded-2xl bg-orange-50 p-3">4. 청해는 숫자+단위, 목적지, 부탁 표현을 받아쓰기처럼 반복하기</li>
        </ul>
      </div>
    </section>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [progress, setProgress] = useProgress();
  const [audioWarning, setAudioWarning] = useState(false);
  const [isKakaoBrowser, setIsKakaoBrowser] = useState(false);
  const currentDay = Math.min(30, Math.max(1, Math.floor((Date.now() - new Date(progress.startedAt).getTime()) / 86400000) + 1));
  const handleAudioBlocked = () => setAudioWarning(true);

  useEffect(() => {
    setIsKakaoBrowser(/KAKAOTALK/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.error("Service worker registration failed", error));
    };
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  const content = tab === "today" ? <Today progress={progress} setProgress={setProgress} setTab={setTab} />
    : tab === "free" ? <FreeStudy progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "diagnostic" ? <Diagnostic progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "vocab" ? <BankMode title="랜덤 N3 단어 1000+" pool={expandedVocabItems} progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "grammar" ? <BankMode title="랜덤 N3 핵심 문법" pool={n3CoreGrammarItems} progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "reading" ? <BankMode title="난이도별 랜덤 독해" pool={levelReadingItems} progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "listening" ? <BankMode title="N3 청해 훈련" pool={listeningItems} progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "mock" ? <MockExam progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : tab === "wrong" ? <WrongNotebook progress={progress} setProgress={setProgress} onAudioBlocked={handleAudioBlocked} />
    : <Dashboard progress={progress} />;

  return (
    <main className={`mx-auto min-h-screen w-full max-w-3xl px-4 pb-[calc(220px+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-[180px] ${progress.darkMode ? "bg-slate-950 text-slate-100" : ""}`}>
      {isKakaoBrowser && <div className="mb-3 rounded-2xl bg-yellow-100 p-3 text-xs font-black text-yellow-900 ring-1 ring-yellow-200">카카오톡 브라우저에서 음성이 안 나오면 Chrome/Safari로 열어주세요.</div>}
      {audioWarning && <button type="button" onClick={() => setAudioWarning(false)} className="mb-3 w-full rounded-2xl bg-rose-100 p-3 text-left text-xs font-black text-rose-900 ring-1 ring-rose-200">브라우저에서 음성 재생이 막혔어요. 크롬 또는 사파리에서 열어주세요. (닫기)</button>}
      <header className="mb-4 rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">JLPT N3 · 30일 크램</p>
            <h1 className="mt-1 text-xl font-black leading-tight text-slate-950 sm:text-2xl">JLPT N3 합격 트레이너</h1>
          </div>
          <div className="rounded-2xl bg-orange-100 px-3 py-2 text-center">
            <p className="text-xs font-black text-orange-700">Day</p>
            <p className="text-xl font-black text-orange-950">{currentDay}/30</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select value={progress.furiganaMode} onChange={(event) => setProgress((prev) => ({ ...prev, furiganaMode: event.target.value as FuriganaMode }))} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
            <option value="exam">요미가나 시험모드</option>
            <option value="learning">요미가나 학습모드</option>
            <option value="hidden">요미가나 숨김모드</option>
          </select>
          <button type="button" onClick={() => setProgress((prev) => ({ ...prev, darkMode: !prev.darkMode }))} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">다크모드 {progress.darkMode ? "ON" : "OFF"}</button>
        </div>
      </header>

      {content}

      <div className="bottom-nav-spacer lg:hidden" aria-hidden="true" />

      <nav aria-label="JLPT N3 주요 학습 메뉴" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-orange-100 bg-white/95 px-2 pt-1 shadow-[0_-12px_40px_rgba(15,23,42,0.10)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-8 gap-0.5">
          {nav.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-xl px-0.5 py-1 text-[10px] font-black leading-none ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600"}`}>
              <span className="block text-sm leading-none">{item.icon}</span><span className="mt-0.5 block">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <aside className="fixed right-6 top-6 hidden w-48 rounded-[2rem] bg-white/90 p-3 shadow-xl ring-1 ring-orange-100 backdrop-blur lg:block">
        <p className="px-2 text-xs font-black text-slate-500">메뉴</p>
        <div className="mt-2 grid gap-1">
          {nav.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-2xl px-3 py-2 text-left text-sm font-black ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-orange-50"}`}>{item.icon} {item.label}</button>)}
        </div>
      </aside>
    </main>
  );
}
