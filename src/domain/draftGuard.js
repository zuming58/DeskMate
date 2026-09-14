// A request started before an edit/save must not roll the editor back.
export function createDraftGuard() {
  let revision = 0;
  let dirty = false;
  return {
    get revision() { return revision; },
    get dirty() { return dirty; },
    edit() { dirty = true; revision += 1; },
    acceptPoll(startRevision) { return !dirty && startRevision === revision; },
    saved(startRevision) {
      if (startRevision !== revision) return false;
      dirty = false; revision += 1;
      return true;
    },
  };
}
