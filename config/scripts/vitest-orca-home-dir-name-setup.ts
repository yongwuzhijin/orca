import {
  DEFAULT_ORCA_DIR_NAME,
  initializeOrcaHomeDirName
} from '../../src/shared/orca-home-dir-name'

// Why: unit suites skip app bootstrap, and reading the snapshot before init throws by
// design. Seed the default so a suite only opts into a rename when it means to.
initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
