transaction 별로 private LRU를 가지고 있는 거라면
victimize 를 할때 자기 private LRU 는 quota 보다 클 때만 건들고
어떻게 다른 transaction 들의 private LRU 를 찾아서 확인하는 거야? 이걸 찾아내는 방법이 궁금해. 현재 transaction은 다른 transaction의 private LRU를 뒤져볼 수 있는 능력이 있는거야? 만약 그렇다면 그 LRU 를 mutex 로 보호해야 하는 거니까 엄청 성능 병목이 있을 수 있는 거 아냐?

Check if the documents contain info on LRU1, LRU2, LRU3, their quotas, their pomotion / demotion rules for BCB.
If not, add a detailed explanation with visuals (svg) in html and md file.
