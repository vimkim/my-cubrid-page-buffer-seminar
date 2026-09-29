;set communication_histogram=yes
;.hist on
SELECT SUM(id) FROM ca_pb_e3 WHERE id BETWEEN 1001 AND 1100;
;.x_hist
SELECT SUM(LENGTH(payload)) FROM ca_pb_e3 WHERE id BETWEEN 1001 AND 1100;
;.dump_hist

