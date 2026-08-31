# Bazel's runfiles tree always ships a "_repo_mapping" manifest translating
# each apparent repo name (as seen from the root module) to Bazel's canonical
# repo name. Under legacy WORKSPACE resolution these are identical (e.g.
# "jazelle"), but under bzlmod any repo produced by a module_extension or
# use_repo_rule gets a namespaced canonical name (e.g.
# "+jazelle_deps_ext+jazelle_dependencies"). Resolving through this manifest
# lets us find //:jazelle's runfiles regardless of which mode produced them.
resolve_canonical_repo() {
  MAPPING="$1"
  APPARENT="$2"
  if [ -f "$MAPPING" ]
  then
    CANONICAL=$(awk -F, -v name="$APPARENT" '$1 == "" && $2 == name { print $3; exit }' "$MAPPING")
    if [ -n "$CANONICAL" ]
    then
      echo "$CANONICAL"
      return
    fi
  fi
  echo "$APPARENT"
}
