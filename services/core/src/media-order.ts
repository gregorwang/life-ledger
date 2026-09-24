import type { ListMediaWorksInput } from "@life-ledger/contracts";

export const MEDIA_WORK_AGGREGATE_SELECT = `
  SELECT
    mw.id,
    mw.media_type,
    mw.media_kind,
    mw.canonical_title,
    mw.aliases_json,
    mw.cover_url,
    mw.watch_status,
    mw.overall_score_100,
    (
      SELECT count(*)
      FROM media_seasons ms
      WHERE ms.media_work_id = mw.id
    ) AS season_count,
    sum(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS log_count,
    sum(
      CASE
        WHEN e.visibility = 'public' AND e.status = 'active' THEN 1
        ELSE 0
      END
    ) AS public_log_count,
    max(
      CASE WHEN e.status = 'active' THEN e.occurred_at ELSE NULL END
    ) AS last_logged_at,
    (
      SELECT latest.date_precision
      FROM media_logs latest_log
      INNER JOIN entries latest ON latest.id = latest_log.entry_id
      WHERE latest_log.media_work_id = mw.id
        AND latest.status = 'active'
      ORDER BY latest.occurred_at DESC, latest.id ASC
      LIMIT 1
    ) AS last_logged_date_precision,
    mw.created_at,
    mw.updated_at
  FROM media_works mw
  LEFT JOIN media_logs ml ON ml.media_work_id = mw.id
  LEFT JOIN entries e ON e.id = ml.entry_id
`;

export function mediaWorkOrderBy(
  sort: ListMediaWorksInput["sort"],
): string {
  const nullsLast = "CASE WHEN last_logged_at IS NULL THEN 1 ELSE 0 END ASC";
  switch (sort) {
    case "recent_asc":
      return `${nullsLast}, last_logged_at ASC, mw.canonical_title ASC, mw.id ASC`;
    case "updated_desc":
      return `${nullsLast}, mw.updated_at DESC, mw.canonical_title ASC, mw.id ASC`;
    case "title_asc":
      return `${nullsLast}, mw.canonical_title ASC, mw.id ASC`;
    case "recent_desc":
      return `${nullsLast}, last_logged_at DESC, mw.canonical_title ASC, mw.id ASC`;
  }
}
