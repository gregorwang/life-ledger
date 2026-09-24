-- Preserve uncertainty separately from the occurred_at sorting anchor.
ALTER TABLE entries
ADD COLUMN date_precision TEXT NOT NULL DEFAULT 'exact'
CHECK (date_precision IN ('exact', 'month', 'year', 'approximate'));

UPDATE entries
SET date_precision = CASE
  -- Legacy uncertain records used 1 July and the 15th as Tokyo-time anchors.
  WHEN
    occurred_timezone = 'Asia/Tokyo' AND
    strftime('%m-%d', occurred_at, '+9 hours') = '07-01'
    THEN 'year'
  WHEN
    occurred_timezone = 'Asia/Tokyo' AND
    strftime('%d', occurred_at, '+9 hours') = '15'
    THEN 'month'
  ELSE 'approximate'
END
WHERE temporal_uncertain = 1;
