;set communication_histogram=yes
;.hist on
SELECT 'E2_READ', COUNT(*), COALESCE(SUM(id), 0) FROM ca_pb_e2;
;.x_hist
INSERT INTO ca_pb_e2
SELECT LEVEL, REPEAT('p', 160) FROM db_root CONNECT BY LEVEL <= 10000;
COMMIT WORK;
SELECT 'E2_WRITE', COUNT(*), SUM(id) FROM ca_pb_e2;
;.dump_hist
