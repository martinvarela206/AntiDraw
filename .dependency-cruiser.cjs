/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-l0-upward',
      comment: 'Capa L0 (core) no puede depender de L1, L2, L3 ni L4',
      severity: 'error',
      from: { path: '^src/webview/core' },
      to: {
        path: '^src/webview/(engine|tools|ui|controllers|services|commands|bridge)'
      }
    },
    {
      name: 'no-l1-upward',
      comment: 'Capa L1 (engine) no puede depender de L2, L3 ni L4',
      severity: 'error',
      from: {
        path: '^src/webview/engine',
        pathNot: '^src/webview/engine/(session/Session\\.ts|canvas/WorkspaceLayoutService\\.ts|commands/SystemCommands\\.ts)'
      },
      to: {
        path: '^src/webview/(tools|ui|controllers|services|bridge)'
      }
    },
    {
      name: 'no-l2-upward',
      comment: 'Capa L2 (tools) no puede depender de L3 ni L4',
      severity: 'error',
      from: {
        path: '^src/webview/tools',
        pathNot: '^src/webview/tools/ToolFactory\\.ts'
      },
      to: {
        path: '^src/webview/(ui|controllers|services|bridge)'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default']
    }
  }
};
