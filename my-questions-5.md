ordered fix 에 대해서 좀 더 궁금해. input & output 이 뭐야? 내부 동작은 어떻게 돌아가는 거야?

redo는 recovery page를 WRITE로 fix하고 log record LSA와 page LSA를 비교합니다. page가 이미 그 record를 반영한다면 redo를 skip하고 ownership을 release합니다. 그렇지 않으면 recovery function을 적용하고 page LSA를 전진시킨 뒤, 필요한 경우 page를 dirty로 표시하고 scope cleanup으로 release합니다. <- scope cleanup 으로 release 한다는게 무슨 뜻이야?

