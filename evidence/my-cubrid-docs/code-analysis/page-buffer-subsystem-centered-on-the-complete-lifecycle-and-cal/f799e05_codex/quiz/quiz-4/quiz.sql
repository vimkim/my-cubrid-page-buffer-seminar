;set communication_histogram=yes
;.hist on
UPDATE ca_pb_e4 SET generation = generation + 1 WHERE id BETWEEN 1 AND 100;
COMMIT WORK;
SELECT COUNT(*), MIN(generation), MAX(generation) FROM ca_pb_e4;
;.dump_hist

