load("//:rules/filter-files.bzl", _filter_files = "filter_files")

def _web_library_impl(ctx):
  build_deps = depset(
    direct = _filter_files(ctx.files.srcs),
    transitive =
      [dep[DefaultInfo].files for dep in ctx.attr.deps] +
      [dep[DefaultInfo].default_runfiles.files for dep in ctx.attr.deps] +
      [dep[DefaultInfo].data_runfiles.files for dep in ctx.attr.deps]
  )

  return [
    DefaultInfo(
      files = build_deps,
    )
  ]

web_library = rule(
  implementation = _web_library_impl,
  attrs = {
    "deps": attr.label_list(
      allow_files = True,
      default = [],
    ),
    "srcs": attr.label_list(
      allow_files = True,
      default = [],
    ),
  }
)

def _get_runfiles(ctx, outputs):
  executable = ctx.outputs.executable

  direct = ctx.files._node + ctx.files._script + ctx.files._untar_script + outputs
  transitive = [dep[DefaultInfo].files for dep in ctx.attr.deps]
  run_deps = depset(
    direct = direct,
    transitive = transitive,
  )

  ctx.actions.write(
    output = ctx.outputs.executable,
    content = """
    export NODE_PRESERVE_SYMLINKS='{preserve_symlinks}'
    export CWD=$(cd `dirname '{srcdir}'` && pwd);
    export NODE=$(cd `dirname '{node}'` && pwd)/$(basename '{node}');
    $NODE '{untar_script}' --runtime;
    $NODE --max_old_space_size=65536 '{build}' "$PWD" "$CWD" "$(pwd)" '{command}' '' '{gen_srcs}' '' "$@"
    """.format(
      node = ctx.files._node[0].path,
      srcdir = ctx.build_file_path,
      command = ctx.attr.command,
      untar_script = ctx.files._untar_script[0].path,
      preserve_symlinks = ctx.attr.preserve_symlinks,
      build = ctx.files._script[0].path,
      gen_srcs = "|".join(ctx.attr.gen_srcs),
    )
  )
  return ctx.runfiles(
    files = [executable],
    transitive_files = run_deps,
  )

def _web_binary_impl(ctx):
  build_output = ctx.outputs.out

  direct = ctx.files._script + ctx.files._untar_script
  transitive = [dep[DefaultInfo].files for dep in ctx.attr.deps]
  build_deps = depset(
    direct = direct,
    transitive = transitive
  )

  ctx.actions.run_shell(
    command = """
    export NODE_PRESERVE_SYMLINKS='{preserve_symlinks}';
    export CWD=$(cd `dirname '{srcdir}'` && pwd);
    export NODE=$(cd `dirname '{node}'` && pwd)/$(basename '{node}');
    export OUT=$(cd `dirname '{output}'` && pwd)/$(basename '{output}');
    export BAZEL_BIN_DIR=$(cd '{bindir}' && pwd);
    export NODE_SKIP_PNP={skip_pnp};
    $NODE '{untar_script}';
    $NODE --max_old_space_size=65536 '{build}' "$PWD" "$CWD" "$BAZEL_BIN_DIR" '{command}' '{dist}' '' "$OUT" $@;
    """.format(
      node = ctx.files._node[0].path,
      srcdir = ctx.build_file_path,
      command = ctx.attr.build,
      dist = "|".join(ctx.attr.dist),
      output = build_output.path,
      bindir = ctx.bin_dir.path,
      preserve_symlinks = ctx.attr.preserve_symlinks,
      untar_script = ctx.files._untar_script[0].path,
      build = ctx.files._script[0].path,
      skip_pnp = 1 if ctx.attr.skip_pnp else 0,
    ),
    tools = ctx.files._node,
    inputs = build_deps,
    outputs = [build_output],
    use_default_shell_env = True
  )
  return [
    DefaultInfo(
      files = depset(
        direct = [build_output],
        transitive = [build_deps],
      ),
      runfiles = _get_runfiles(ctx, [build_output]),
    )
  ]

web_binary = rule(
  implementation = _web_binary_impl,
  attrs = {
    "build": attr.string(
      default = "build",
    ),
    "command": attr.string(
      default = "dev",
    ),
    "deps": attr.label_list(
      allow_files = True,
      default = [],
    ),
    "dist": attr.string_list(),
    "gen_srcs": attr.string_list(
      default = [],
    ),
    "_node": attr.label(
      executable = True,
      allow_files = True,
      cfg = "host",
      default = Label("@jazelle_dependencies//:node"),
    ),
    "preserve_symlinks": attr.string(default=''),
    "_untar_script": attr.label(
      allow_files = True,
      default = Label("//:rules/untar.js"),
    ),
    "_script": attr.label(
      allow_files = True,
      default = Label("//:rules/execute-command.js"),
    ),
    "skip_pnp": attr.bool(
      default = False,
    ),
  },
  executable = True,
  outputs = {
    "out": "__jazelle__%{name}.tgz"
  },
)

def _web_executable_impl(ctx):
  return [
    DefaultInfo(
      runfiles = _get_runfiles(ctx, []),
    )
  ]

_WEB_EXECUTABLE_ATTRS = {
  "command": attr.string(),
  "preserve_symlinks": attr.string(default=''),
  "deps": attr.label_list(
    allow_files = True,
    default = [],
  ),
  "gen_srcs": attr.string_list(
    default = [],
  ),
  "_node": attr.label(
    executable = True,
    allow_files = True,
    cfg = "host",
    default = Label("@jazelle_dependencies//:node"),
  ),
  "_script": attr.label(
    allow_files = True,
    default = Label("//:rules/execute-command.js"),
  ),
  "_untar_script": attr.label(
    allow_files = True,
    default = Label("//:rules/untar.js"),
  )
}

web_executable = rule(
  implementation = _web_executable_impl,
  attrs = _WEB_EXECUTABLE_ATTRS,
  executable = True,
)

web_test = rule(
  implementation = _web_executable_impl,
  attrs = _WEB_EXECUTABLE_ATTRS,
  test = True,
)
