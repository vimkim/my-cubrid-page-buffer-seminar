;set communication_histogram=yes
;.hist on
UPDATE ca_pb_e4 SET generation = generation + 1, payload = REPEAT('w', 800);
COMMIT WORK;
SELECT 'E4_DIRTY_LOG', COUNT(*), MIN(generation), MAX(generation),
       SUM(CASE WHEN LENGTH(payload) = 800 THEN 0 ELSE 1 END)
  FROM ca_pb_e4;
;.dump_hist
