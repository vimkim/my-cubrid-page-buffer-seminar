;set communication_histogram=yes
;.hist on
SELECT COUNT(*), SUM(id) FROM ca_pb_e1;
;.x_hist
SELECT COUNT(*), SUM(id) FROM ca_pb_e1;
;.dump_hist

