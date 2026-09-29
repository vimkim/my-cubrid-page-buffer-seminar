;set communication_histogram=yes
;.hist on
SELECT 'E1_FIRST', COUNT(*), SUM(id), SUM(LENGTH(payload)) FROM ca_pb_e1;
;.x_hist
SELECT 'E1_SECOND', COUNT(*), SUM(id), SUM(LENGTH(payload)) FROM ca_pb_e1;
;.dump_hist
