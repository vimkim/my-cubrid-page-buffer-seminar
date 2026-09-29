# Expected oracle

logged update는 10000 rows의 generation을 정확히 1로 만들고 dirty call이 양수이며 오류 없이 commit한다.

정확한 성능 수치나 모든 concurrent schedule을 일반화하지 않는다. 위 control과 limitation을 만족할 때만 source+runtime claim에 사용한다.

