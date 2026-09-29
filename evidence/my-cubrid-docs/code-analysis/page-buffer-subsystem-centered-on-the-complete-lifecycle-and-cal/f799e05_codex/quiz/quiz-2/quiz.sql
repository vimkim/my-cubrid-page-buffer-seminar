;set communication_histogram=yes
;.hist on
SELECT COUNT(*) FROM ca_pb_e2;
;.x_hist
INSERT INTO ca_pb_e2
SELECT LEVEL, REPEAT('h', 160) FROM db_root CONNECT BY LEVEL <= 10;
UPDATE ca_pb_e2 SET payload = payload || 'u' WHERE id BETWEEN 1 AND 10;
COMMIT WORK;
SELECT COUNT(*), MIN(LENGTH(payload)), MAX(LENGTH(payload)) FROM ca_pb_e2;
;.dump_hist
