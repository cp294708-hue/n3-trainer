"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "today" | "diagnostic" | "vocab" | "grammar" | "reading" | "listening" | "wrong" | "dashboard";
type Skill = "vocab" | "grammar" | "reading" | "listening";
type Level = "new" | "learning" | "review" | "mastered";

type Example = {
  jp: string;
  furigana: string;
  ko: string;
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
};

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

const listeningItems: StudyItem[] = [
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

const allItems = [...vocabItems, ...grammarItems, ...readingItems, ...listeningItems];

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
  { id: "today", label: "오늘", icon: "🔥" },
  { id: "diagnostic", label: "진단", icon: "🧪" },
  { id: "vocab", label: "어휘", icon: "🧠" },
  { id: "grammar", label: "문법", icon: "🔗" },
  { id: "reading", label: "독해", icon: "📖" },
  { id: "listening", label: "청해", icon: "🎧" },
  { id: "wrong", label: "오답", icon: "📝" },
  { id: "dashboard", label: "현황", icon: "📊" },
];

function useProgress() {
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("n3-cram-progress");
    if (raw) {
      try {
        setProgress({ ...defaultProgress, ...JSON.parse(raw) });
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

function speakJapanese(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.86;
  utterance.pitch = 1.02;
  const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("ja"));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function ExampleCard({ example, compact = false }: { example: Example; compact?: boolean }) {
  return (
    <div className="rounded-3xl border border-orange-100 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${compact ? "text-lg" : "text-xl"} font-black leading-relaxed text-slate-950`}>{example.jp}</p>
          <p className="ruby mt-1 text-sm font-bold text-rose-700">{example.furigana}</p>
        </div>
        <button
          type="button"
          onClick={() => speakJapanese(example.jp)}
          className="shrink-0 rounded-full bg-rose-600 px-3 py-2 text-sm font-black text-white shadow-lg shadow-rose-200 active:scale-95"
          aria-label="일본어 음성 듣기"
        >
          🔊
        </button>
      </div>
      <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-sm font-bold text-orange-950">🇰🇷 {example.ko}</p>
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
  return {
    ...progress,
    xp: progress.xp + (correct ? 12 : 4),
    lastStudyDate: todayIso(),
    srs: { ...progress.srs, [item.id]: { ease, due: addDays(interval), seen, correct: correctCount, level } },
  };
}

function addWrong(progress: Progress, entry: WrongEntry) {
  return { ...progress, wrong: [entry, ...progress.wrong.filter((old) => old.id !== entry.id)].slice(0, 80) };
}

function Trainer({ title, items, progress, setProgress }: { title: string; items: StudyItem[]; progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>> }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const item = items[index % items.length];
  const srs = progress.srs[item.id];
  const isAnswered = selected !== null;
  const correct = selected === item.answer;

  const submit = (choice: string) => {
    if (selected) return;
    setSelected(choice);
    setProgress((prev) => {
      let next = updateStudyProgress(prev, item, choice === item.answer);
      if (choice !== item.answer) {
        next = addWrong(next, { id: `${item.id}-${Date.now()}`, title: item.title, correct: item.answer, chosen: choice, at: new Date().toISOString(), kind: item.kind });
      }
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-200">{title}</p>
        <h2 className="mt-1 text-2xl font-black">{item.title}</h2>
        <p className="mt-1 text-sm text-slate-300">{item.focus}</p>
        <div className="mt-3 flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/10 px-3 py-1">SRS: {srs?.level ?? "new"}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Due: {srs?.due ?? "오늘"}</span>
        </div>
      </div>

      <ExampleCard example={item} />

      <div className="grid gap-2">
        {item.choices.map((choice) => {
          const state = isAnswered && choice === item.answer ? "border-emerald-500 bg-emerald-50 text-emerald-950" : isAnswered && choice === selected ? "border-rose-500 bg-rose-50 text-rose-950" : "border-slate-200 bg-white text-slate-800";
          return (
            <button key={choice} type="button" onClick={() => submit(choice)} className={`rounded-2xl border-2 p-4 text-left font-black shadow-sm active:scale-[0.99] ${state}`}>
              {choice}
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className={`text-lg font-black ${correct ? "text-emerald-700" : "text-rose-700"}`}>{correct ? "정답! 바로 다음 복습 간격이 늘어났어요." : `오답: 정답은 ${item.answer}`}</p>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-700">💡 한국어식 감각: {item.koreanHint}</p>
          <p className="mt-2 text-sm font-bold leading-6 text-rose-800">⚠️ 자주 헷갈림: {item.pitfall}</p>
          <button type="button" onClick={() => { setSelected(null); setIndex((value) => value + 1); }} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 font-black text-white">
            다음 카드
          </button>
        </div>
      )}
    </section>
  );
}

function Diagnostic({ progress, setProgress }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const score = diagnosticQuestions.filter((question) => answers[question.id] === question.answer).length;
  const done = Object.keys(answers).length === diagnosticQuestions.length;

  const choose = (question: QuizQuestion, choice: string) => {
    if (answers[question.id]) return;
    setAnswers((prev) => ({ ...prev, [question.id]: choice }));
    if (choice !== question.answer) {
      setProgress((prev) => addWrong(prev, { id: `${question.id}-${Date.now()}`, title: question.prompt, correct: question.answer, chosen: choice, at: new Date().toISOString(), kind: "diagnostic" }));
    }
  };

  const saveScore = () => setProgress((prev) => ({ ...prev, diagnosticScore: Math.round((score / diagnosticQuestions.length) * 100), xp: prev.xp + score * 5 }));

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-orange-500 to-rose-600 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-100">10문항 빠른 진단</p>
        <h2 className="mt-1 text-2xl font-black">제로베이스 위치 확인</h2>
        <p className="mt-2 text-sm font-bold text-white/90">모르면 찍지 말고, 틀린 문항을 오답노트로 보내 30일 계획의 우선순위를 올립니다.</p>
      </div>
      {diagnosticQuestions.map((question, idx) => {
        const selected = answers[question.id];
        return (
          <div key={question.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
            <p className="mb-3 text-sm font-black text-slate-500">Q{idx + 1}. {question.prompt}</p>
            <ExampleCard example={question.example} compact />
            <div className="mt-3 grid gap-2">
              {question.choices.map((choice) => {
                const state = selected && choice === question.answer ? "bg-emerald-50 border-emerald-500" : selected === choice ? "bg-rose-50 border-rose-500" : "bg-slate-50 border-slate-200";
                return <button key={choice} type="button" onClick={() => choose(question, choice)} className={`rounded-2xl border-2 p-3 text-left font-black ${state}`}>{choice}</button>;
              })}
            </div>
            {selected && <p className="mt-3 text-sm font-bold leading-6 text-slate-700">{question.explanation}</p>}
          </div>
        );
      })}
      <button type="button" disabled={!done} onClick={saveScore} className="w-full rounded-2xl bg-slate-950 py-4 font-black text-white disabled:bg-slate-300">
        진단 결과 저장하기 ({score}/{diagnosticQuestions.length})
      </button>
    </section>
  );
}

function Today({ progress, setProgress, setTab }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; setTab: (tab: Tab) => void }) {
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

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-200">Day {currentDay} / 30 · {todayPlan.phase}</p>
        <h2 className="mt-1 text-3xl font-black">{todayPlan.focus}</h2>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-200">한국어 화자는 한자어 때문에 빨리 늘 수 있지만, 조사·자동사/타동사·완곡한 부탁에서 자주 실수합니다. 오늘은 “한국어로 비슷해 보여도 일본어 덩어리는 다르다”를 확인하세요.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatPill label="연속 학습" value={`${progress.streak}일`} />
        <StatPill label="XP" value={progress.xp} />
        <StatPill label="완료" value={`${progress.completedDays.length}/30`} />
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
        <h3 className="text-lg font-black">오늘의 25분 루틴</h3>
        <div className="mt-3 grid gap-2">
          {cramBlocks.map((block) => <p key={block} className="rounded-2xl bg-rose-50 p-3 text-sm font-black text-rose-950">{block}</p>)}
        </div>
        <ol className="mt-3 space-y-2 text-sm font-bold text-slate-700">
          {todayPlan.mission.map((mission, idx) => <li key={mission} className="rounded-2xl bg-orange-50 p-3">{idx + 1}. {mission}</li>)}
        </ol>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setTab("vocab")} className="rounded-2xl bg-orange-500 py-3 font-black text-white">어휘 시작</button>
          <button type="button" onClick={() => setTab("grammar")} className="rounded-2xl bg-rose-600 py-3 font-black text-white">문법 시작</button>
        </div>
        <button type="button" onClick={completeToday} className="mt-2 w-full rounded-2xl bg-slate-950 py-3 font-black text-white">오늘 학습 완료 체크</button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <h3 className="text-lg font-black">30일 계획</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {plan.map((day) => (
            <div key={day.day} className={`rounded-2xl border p-3 ${progress.completedDays.includes(day.day) ? "border-emerald-300 bg-emerald-50" : day.day === currentDay ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-xs font-black text-slate-500">Day {day.day} · {day.phase}</p>
              <p className="font-black text-slate-900">{day.focus}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WrongNotebook({ progress, setProgress }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>> }) {
  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-orange-100">
        <h2 className="text-2xl font-black">오답노트</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">한국어 화자에게 오답은 약점 지도가 됩니다. 정답만 외우지 말고 내가 고른 한국어 표현과 비교하세요.</p>
        <button type="button" onClick={() => setProgress((prev) => ({ ...prev, wrong: [] }))} className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">오답 비우기</button>
      </div>
      {progress.wrong.length === 0 ? <p className="rounded-3xl bg-white p-6 text-center font-bold text-slate-500">아직 오답이 없습니다. 진단 또는 트레이너를 풀어보세요.</p> : progress.wrong.map((entry) => (
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
  const passProbability = Math.min(92, Math.round(18 + diagnostic * 0.25 + progress.completedDays.length * 1.35 + mastered * 3 + Math.min(progress.streak, 14) * 1.2 - progress.wrong.length * 0.25));
  const dueToday = allItems.filter((item) => !progress.srs[item.id] || progress.srs[item.id].due <= todayIso()).length;

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 to-slate-700 p-5 text-white shadow-xl">
        <p className="text-sm font-black text-orange-200">합격 가능성 추정</p>
        <h2 className="mt-2 text-5xl font-black">{passProbability}%</h2>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-200">진단 점수, 30일 완료율, SRS 숙련도, 오답량을 합친 학습용 추정치입니다. 실제 합격을 보장하지 않지만 매일 무엇을 올려야 하는지 보여줍니다.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatPill label="진단 점수" value={progress.diagnosticScore === null ? "미완료" : `${progress.diagnosticScore}%`} />
        <StatPill label="오늘 복습" value={`${dueToday}개`} />
        <StatPill label="학습 카드" value={reviewed} />
        <StatPill label="마스터" value={mastered} />
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
  const dueItems = useMemo(() => allItems.filter((item) => !progress.srs[item.id] || progress.srs[item.id].due <= todayIso()), [progress.srs]);

  const content = tab === "today" ? <Today progress={progress} setProgress={setProgress} setTab={setTab} />
    : tab === "diagnostic" ? <Diagnostic progress={progress} setProgress={setProgress} />
    : tab === "vocab" ? <Trainer title="N3 필수 어휘" items={vocabItems} progress={progress} setProgress={setProgress} />
    : tab === "grammar" ? <Trainer title="한국어식 비교 문법" items={grammarItems} progress={progress} setProgress={setProgress} />
    : tab === "reading" ? <Trainer title="N3 독해 훈련" items={readingItems} progress={progress} setProgress={setProgress} />
    : tab === "listening" ? <Trainer title="N3 청해 훈련" items={listeningItems} progress={progress} setProgress={setProgress} />
    : tab === "wrong" ? <WrongNotebook progress={progress} setProgress={setProgress} />
    : <Dashboard progress={progress} />;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
      <header className="mb-4 rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">JLPT N3 · 30일 크램</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">한국어 화자 전용 합격 트레이너</h1>
          </div>
          <div className="rounded-2xl bg-orange-100 px-3 py-2 text-center">
            <p className="text-xs font-black text-orange-700">Due</p>
            <p className="text-xl font-black text-orange-950">{dueItems.length}</p>
          </div>
        </div>
      </header>

      {content}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-orange-100 bg-white/95 px-2 pt-2 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
          {nav.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-2xl px-2 py-2 text-xs font-black ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600"}`}>
              <span className="block text-lg">{item.icon}</span>{item.label}
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
