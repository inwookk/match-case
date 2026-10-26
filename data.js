/* 시안용 예시 데이터. 실제 사람이 아니라 가상의 참가자 18명이다. */
(function (root) {
  'use strict';

  const base = {
    status: 'confirmed', religion: 'none', religionMatters: false, politics: '', politicsMatters: false,
    dealbreakers: [], dealNote: '', nice: [], niceNote: '', avoid: [], lastLove: '', lastLovePublic: false,
  };

  const rows = [
    { id: 'p1', name: '김서연', gender: 'F', birthYear: 1995, yearFrom: 1990, yearTo: 1996, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'seoul-se', station: '잠실', job: '마케터', dealbreakers: ['smoker'], nice: ['traveler', 'active', 'near'], mbti: 'ENFJ', strength: '맛집 찾기', travel: '포르투갈 리스본', hobbies: ['여행', '러닝', '맛집'], diet: '매운 음식 좋아해요. 오이는 못 먹어요', insta: 'seoyeon.days' },
    { id: 'p2', name: '이지민', gender: 'F', birthYear: 1996, yearFrom: 1991, yearTo: 1997, intent: 'casual', smoke: 'no', drink: 'often', area: 'seoul-nw', station: '합정', job: '디자이너', dealbreakers: ['non-drinker'], nice: ['drinks', 'culture', 'pets'], mbti: 'ISFP', strength: '사진 잘 찍어주기', travel: '교토', hobbies: ['사진', '카페', '전시', '와인'], diet: '해산물 빼고 다 잘 먹어요', insta: 'jimin.frame', lastLove: '1년 전, 2년 만났어요', lastLovePublic: true },
    { id: 'p3', name: '박하은', gender: 'F', birthYear: 1994, yearFrom: 1990, yearTo: 1995, intent: 'marriage', smoke: 'no', drink: 'sometimes', religion: 'protestant', religionMatters: true, area: 'seoul-c', station: '용산', job: '간호사', dealbreakers: ['no-marriage', 'smoker'], nice: ['marriage', 'cook', 'nonsmoker'], mbti: 'ISTJ', strength: '집밥 요리', travel: '제주 한 달 살기', hobbies: ['요리', '독서', '등산'], diet: '평일엔 건강식, 주말엔 치킨', avoid: ['정준호'], insta: 'haeun.kitchen' },
    { id: 'p4', name: '최수빈', gender: 'F', birthYear: 1997, yearFrom: 1992, yearTo: 1998, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'gg-s', station: '판교', job: '개발자', dealbreakers: ['far'], nice: ['active', 'near', 'traveler'], mbti: 'ENTP', strength: '보드게임 규칙 설명', travel: '아이슬란드', hobbies: ['게임', '클라이밍', '여행'], diet: '고기파예요', avoid: ['강다은'], insta: 'subin.boulder' },
    { id: 'p5', name: '정예린', gender: 'F', birthYear: 1993, yearFrom: 1989, yearTo: 1995, intent: 'marriage', smoke: 'no', drink: 'none', religion: 'catholic', area: 'seoul-ne', station: '성수', job: '교사', dealbreakers: ['heavy-drinker'], nice: ['marriage', 'culture', 'nonsmoker'], mbti: 'INFJ', strength: '고민 들어주기', travel: '산티아고 순례길', hobbies: ['독서', '영화', '카페'], diet: '술은 못 마시고 디저트를 좋아해요', insta: 'yerin.reads' },
    { id: 'p6', name: '강다은', gender: 'F', birthYear: 1996, yearFrom: 1991, yearTo: 1997, intent: 'casual', smoke: 'sometimes', drink: 'often', area: 'seoul-sw', station: '여의도', job: '증권사', nice: ['drinks', 'traveler', 'active'], mbti: 'ESTP', strength: '노래방 100점', travel: '방콕', hobbies: ['음악', '운동', '맛집', '와인'], diet: '다 잘 먹어요', insta: 'daeun.on' },
    { id: 'p7', name: '윤유진', gender: 'F', birthYear: 1995, yearFrom: 1990, yearTo: 1996, intent: 'serious', smoke: 'no', drink: 'sometimes', religion: 'buddhist', area: 'incheon', station: '부평', job: '약사', dealbreakers: ['smoker'], nice: ['pets', 'cook', 'near'], mbti: 'INFP', strength: '고양이 사진 많음', travel: '삿포로', hobbies: ['반려동물', '요리', '영화'], diet: '채식 지향이에요. 생선은 먹어요', insta: 'yujin.and.cats' },
    { id: 'p8', name: '한채원', gender: 'F', birthYear: 1994, yearFrom: 1990, yearTo: 1995, intent: 'serious', smoke: 'no', drink: 'sometimes', politics: 'moderate', politicsMatters: true, area: 'seoul-c', station: '광화문', job: '변호사', dealbreakers: ['diff-politics'], nice: ['culture', 'traveler', 'drinks'], mbti: 'ENTJ', strength: '여행 계획 짜기', travel: '뉴욕', hobbies: ['여행', '전시', '와인'], diet: '와인이랑 치즈', insta: 'chaewon.trip' },
    { id: 'p9', name: '김민준', gender: 'M', birthYear: 1993, yearFrom: 1993, yearTo: 1998, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'seoul-se', station: '선릉', job: '회계사', nice: ['traveler', 'active', 'near'], mbti: 'ESFJ', strength: '분위기 띄우기', travel: '스위스 인터라켄', hobbies: ['여행', '러닝', '맛집'], diet: '양 많이 먹어요', insta: 'minjun.run' },
    { id: 'p10', name: '이도윤', gender: 'M', birthYear: 1994, yearFrom: 1994, yearTo: 1998, intent: 'casual', smoke: 'yes', drink: 'often', area: 'seoul-nw', station: '망원', job: '영상 PD', nice: ['drinks', 'culture'], mbti: 'ENFP', strength: '기타 연주', travel: '베를린', hobbies: ['음악', '사진', '와인'], diet: '야식 좋아해요', insta: 'doyoon.tape' },
    { id: 'p11', name: '박현우', gender: 'M', birthYear: 1992, yearFrom: 1993, yearTo: 1997, intent: 'marriage', smoke: 'no', drink: 'sometimes', religion: 'protestant', religionMatters: true, area: 'seoul-c', station: '용산', job: '공무원', dealbreakers: ['diff-religion'], nice: ['marriage', 'cook', 'nonsmoker'], mbti: 'ISTJ', strength: '파스타 만들기', travel: '하와이', hobbies: ['요리', '등산', '독서'], diet: '건강식 위주예요', insta: 'hyunwoo.pasta' },
    { id: 'p12', name: '최지훈', gender: 'M', birthYear: 1995, yearFrom: 1994, yearTo: 1998, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'gg-s', station: '수원', job: '개발자', nice: ['active', 'traveler'], mbti: 'INTP', strength: '뭐든 조립·수리', travel: '아이슬란드', hobbies: ['클라이밍', '게임', '여행'], diet: '고기 좋아해요', insta: 'jihoon.fix' },
    { id: 'p13', name: '정준호', gender: 'M', birthYear: 1993, yearFrom: 1993, yearTo: 1997, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'seoul-ne', station: '건대입구', job: '연구원', nice: ['culture', 'pets'], mbti: 'INFJ', strength: '영화 추천', travel: '교토', hobbies: ['영화', '독서', '반려동물'], diet: '아무거나 잘 먹어요', insta: 'junho.cinema' },
    { id: 'p14', name: '강태민', gender: 'M', birthYear: 1996, yearFrom: 1994, yearTo: 1998, intent: 'casual', smoke: 'sometimes', drink: 'often', area: 'seoul-sw', station: '영등포', job: '영업', nice: ['drinks', 'active'], mbti: 'ESTP', strength: '볼링 평균 180', travel: '다낭', hobbies: ['운동', '게임', '맛집'], diet: '삼겹살에 소주', insta: 'taemin.bowl' },
    { id: 'p15', name: '윤성민', gender: 'M', birthYear: 1991, yearFrom: 1993, yearTo: 1997, intent: 'marriage', smoke: 'no', drink: 'none', religion: 'catholic', politics: 'moderate', area: 'seoul-se', station: '서초', job: '치과의사', dealbreakers: ['heavy-drinker'], nice: ['marriage', 'culture', 'near'], mbti: 'INFJ', strength: '손편지 쓰기', travel: '산티아고 순례길', hobbies: ['독서', '전시', '카페'], diet: '술은 안 마셔요', insta: 'sungmin.letters' },
    { id: 'p16', name: '한우진', gender: 'M', birthYear: 1994, yearFrom: 1993, yearTo: 1997, intent: 'serious', smoke: 'no', drink: 'sometimes', politics: 'progressive', area: 'incheon', station: '송도', job: '항공사', nice: ['pets', 'cook', 'traveler'], mbti: 'ISFJ', strength: '강아지 산책 전문', travel: '삿포로', hobbies: ['반려동물', '요리', '여행'], diet: '해산물 좋아해요', insta: 'woojin.walks' },
    { id: 'p17', name: '오소희', gender: 'F', birthYear: 1995, yearFrom: 1991, yearTo: 1997, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'seoul-nw', station: '홍대입구', job: '에디터', status: 'waitlist', nice: ['culture', 'traveler'], mbti: 'INTJ', strength: '책 추천', travel: '리스본', hobbies: ['독서', '여행', '카페'], diet: '커피 없인 못 살아요', insta: 'sohee.pages' },
    { id: 'p18', name: '서지호', gender: 'M', birthYear: 1994, yearFrom: 1992, yearTo: 1998, intent: 'serious', smoke: 'no', drink: 'sometimes', area: 'seoul-c', station: '시청', job: '기자', status: 'applied', nice: ['traveler', 'culture'], mbti: 'ENTJ', strength: '질문 잘하기', travel: '몬트리올', hobbies: ['여행', '독서', '전시'], diet: '다 잘 먹어요', insta: 'jiho.asks' },
  ];

  function samplePeople() {
    return rows.map((row, i) => {
      const confirmed = (row.status || base.status) === 'confirmed';
      return {
        ...base,
        ...row,
        nick: row.name.slice(1),
        phone: `010-0000-${String(i + 1).padStart(4, '0')}`,
        depositName: row.name,
        number: confirmed ? i + 1 : null,
        appliedAt: i + 1,
      };
    });
  }

  function samplePicks() {
    return {
      p2: ['p10', 'p14'],
      p10: ['p2', 'p6'],
      p3: ['p11'],
      p11: ['p3', 'p5'],
      p4: ['p12'],
      p12: ['p4', 'p1'],
      p9: ['p1', 'p4'],
      p7: ['p16'],
      p16: ['p7', 'p1'],
    };
  }

  function sampleSettings() {
    return {
      name: '11월 친구 미팅',
      date: '11월 15일 토요일',
      start: '19:00',
      place: '을지로 OO 라운지 (예시)',
      deposit: 30000,
      account: 'OO은행 123-456-789012 · 예금주 홍길동 (예시)',
      refund: '파티 3일 전까지 취소하면 전액 돌려드려요. 그 뒤로는 돌려드리지 않아요.',
    };
  }

  const api = { samplePeople, samplePicks, sampleSettings };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeetData = api;
}(typeof window !== 'undefined' ? window : globalThis));
