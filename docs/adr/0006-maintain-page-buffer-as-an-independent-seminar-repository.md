# Maintain page buffer as an independent seminar repository

The page-buffer documentation has outgrown its directory in `my-cubrid-docs`. Move the entire directory's documentation product into an independent Git repository, preserving the separate editorial roles of the Audience-facing seminar site and Maintainer Guide. The user will later add that repository as a submodule of the multi-topic `my-cubrid-seminar` collection.

## Consequences

The topic repository owns the seminar, guide, assets, validation tooling, and authoring records together, avoiding a repository split between the seminar and its canonical explanations. Existing shared URLs may break; compatibility at the former hosting location is not required. This relaxes earlier URL-stability requirements only for the repository migration, not unrelated editorial changes.

The topic repository will live at `/home/vimkim/gh/my-cubrid-page-buffer-seminar`. Preserve extracted directory history where feasible and import required external evidence with its dependencies and source-revision provenance. This keeps reading independent of the former checkout layout, while validation deliberately retains the user's existing personal tooling dependencies.

The [migration design](../../.scratch/seminar-repository-migration/spec.md) records remaining execution decisions. This records decisions accepted on 2026-09-29; the migration has not been executed.
