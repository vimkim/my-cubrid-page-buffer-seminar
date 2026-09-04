pgbuf_bcb_register_hit_for_lru()는 quota.adjust_age마다 containing LRU에 hit 하나를 기록할 수 있다. bcb->hit_age가 더 오래됐으면 monitor.lru_hits[lru_idx]를 증가시키고 ...

<- 이거 age를 증가시키는 건 누구야?

---

0012-prove-replacement-progress.html <- 잘 썼는데 너무 어려워.

private LRU -> shared LRU 로 가는 과정

fix -> unfix 될 경우 어디로 배치되는지, 어떻게 움직이는지 좀 더 자세히 설명해줘.

각각 함수들 시간복잡도는 어느정도인지도 궁금해

---

위 내용들을 md, html 에 반영해줘.



