;set communication_histogram=yes
;.hist on
SELECT 'E3_COVERED', SUM(id) FROM ca_pb_e3 WHERE id BETWEEN 1001 AND 1100;
;.x_hist
SELECT 'E3_NONCOVERED', SUM(LENGTH(payload)) FROM ca_pb_e3 WHERE id BETWEEN 1001 AND 1100;
;.x_hist
UPDATE ca_pb_e3 SET generation = generation + 1 WHERE id BETWEEN 1001 AND 1100;
COMMIT WORK;
SELECT 'E3_UPDATE', COUNT(*), SUM(generation) FROM ca_pb_e3 WHERE id BETWEEN 1001 AND 1100;
;.dump_hist
