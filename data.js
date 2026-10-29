// data.js — 캐릭터 정의 (1~10단계, 1단계 우사기 / 3단계 치이카와)
//
// imgScale  : 원 지름(2r) 대비 이미지 표시 비율 (0~1)
// imgOffsetY: 이미지 수직 보정값 (반지름 r 기준 비율)
// soundPath : 합성 생성 시 재생할 개별 음성 파일 (null이면 assets/audio/merge.wav 사용)
// mouthPos  : 10단계 아노코 입 위치 정규화 좌표 (-1~1 기준, x: 좌우, y: 상하)

const CHARACTERS = [
  { level: 1,  name: '우사기',   radius: 18,  color: '#F4A7B9', image: 'assets/usagi.png',     soundPath: 'assets/audio/usagi.mp3',     imgScale: 0.76, imgOffsetY: 0 },
  { level: 2,  name: '하치와레', radius: 24,  color: '#8EC6E6', image: 'assets/hachiware.png', soundPath: 'assets/audio/hachiware.mp3', imgScale: 0.80, imgOffsetY: 0 },
  { level: 3,  name: '치이카와', radius: 32,  color: '#FFD966', image: 'assets/chiikawa.png',  soundPath: 'assets/audio/chiikawa.mp3',  imgScale: 0.82, imgOffsetY: 0 },
  { level: 4,  name: '모몽가',   radius: 42,  color: '#A8D8A8', image: 'assets/momonga.png',   soundPath: 'assets/audio/momonga.mp3',   imgScale: 0.80, imgOffsetY: 0 },
  { level: 5,  name: '쿠리만쥬', radius: 54,  color: '#D4A5E5', image: 'assets/kurimanju.png', soundPath: 'assets/audio/kurimanju.mp3', imgScale: 0.82, imgOffsetY: 0 },
  { level: 6,  name: '시사',     radius: 68,  color: '#F4A460', image: 'assets/shisa.png',     soundPath: 'assets/audio/shisa.mp3',     imgScale: 0.76, imgOffsetY: 0 },
  { level: 7,  name: '랏코',     radius: 84,  color: '#87CEEB', image: 'assets/rakko.png',     soundPath: null,                         imgScale: 0.80, imgOffsetY: 0 },
  { level: 8,  name: '카니',     radius: 96,  color: '#FF9EAA', image: 'assets/furuhonya.png', soundPath: null,                         imgScale: 0.82, imgOffsetY: 0 },
  { level: 9,  name: '데카츠요', radius: 110, color: '#A090D0', image: 'assets/dekatsuyo.png', soundPath: null,                         imgScale: 0.82, imgOffsetY: 0 },
  { level: 10, name: '아노코',   radius: 124, color: '#E87A90', image: 'assets/anoko.png',     soundPath: null,                         imgScale: 0.84, imgOffsetY: 0.05, mouthPos: { x: 0.02, y: 0.12 } },
];
