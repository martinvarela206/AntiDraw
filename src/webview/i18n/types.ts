export type Language = 'es' | 'en';

export interface Translations {
  // Common
  common: {
    ready: string;
    cancel: string;
    apply: string;
    reset: string;
    close: string;
    delete: string;
    undo: string;
    redo: string;
    nodes: string;
    elements: string;
    selected: string;
    none: string;
    solid: string;
    custom: string;
    color: string;
    width: string;
    height: string;
    angle: string;
    radius: string;
    position: string;
    scale: string;
    rotation: string;
    add: string;
    remove: string;
    type: string;
    open: string;
    closed: string;
  };

  // TopBar
  topbar: {
    undo: string;
    redo: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignTop: string;
    alignMiddle: string;
    alignBottom: string;
    flipHorizontal: string;
    flipVertical: string;
    bringFront: string;
    bringForward: string;
    sendBackward: string;
    sendBack: string;
    toggleLayers: string;
    toggleRulers: string;
    toggleGrid: string;
    toggleGuides: string;
    lockGuides: string;
    unlockGuides: string;
    snapPixel: string;
    snapGrid: string;
    snapGuide: string;
    snapNode: string;
    snapEdge: string;
    snapViewBox: string;
    snapAngular: string;
  };

  // Toolbar
  toolbar: {
    select: string;
    node: string;
    pen: string;
    line: string;
    polyline: string;
    rect: string;
    circle: string;
    ellipse: string;
    polygon: string;
    star: string;
    scissors: string;
    knife: string;
    eraser: string;
    smartFill: string;
    shapeBuilder: string;
    addVertex: string;
    zoom: string;
    canvas: string;
    drawerCutTooltip: string;
    drawerConstructTooltip: string;
  };

  // Status Bar
  statusbar: {
    selectionEmpty: string;
    selectionSingle: string;
    selectionMultiple: string;
    zoomLevel: string;
    canvasPropsTooltip: string;
    languageToggleTooltip: string;
    recoveredFromError: string;
    recenterViewBox: string;
  };

  // Panels & Inspectors
  panels: {
    canvasProps: string;
    viewboxScaling: string;
    currentColorView: string;
    rootSvgAttrs: string;
    artboardBackground: string;
    geometry: string;
    transform: string;
    appearance: string;
    stroke: string;
    pathfinder: string;
    primitives: string;
    nodes: string;
    effects: string;
    sceneTree: string;
    rulerGuides: string;
    blend: string;
    multiSelection: string;
    swatches: string;
  };

  // Inspector Fields & Buttons
  inspector: {
    // Mode & Transform
    mode: string;
    modeMove: string;
    modeScale: string;
    modeRotate: string;
    modeDistort: string;
    modeDistortActive: string;
    scaleStroke: string;
    scaleCorners: string;
    advanced: string;
    lockAspect: string;
    resetPivot: string;
    convertToCurves: string;
    primitiveDetected: string;
    simplifyTo: string;

    // Appearance & Fill
    fill: string;
    strokeLabel: string;
    opacity: string;
    linearGrad: string;
    radialGrad: string;
    fillLockScale: string;
    fillLockPos: string;
    fillLockRot: string;
    resetFillScale: string;
    resetFillPos: string;
    resetFillRot: string;
    fillTransformTitle: string;
    noFill: string;
    noStroke: string;
    addFill: string;
    removeFill: string;
    addStroke: string;
    removeStroke: string;
    fillTypeSolid: string;
    fillTypeLinear: string;
    fillTypeRadial: string;
    fillTypeNone: string;

    // Stroke
    strokeWidth: string;
    strokeCap: string;
    strokeJoin: string;
    strokeMiter: string;
    strokeDash: string;
    strokeMarkers: string;
    strokeToPath: string;
    profile: string;
    profileUniform: string;
    profileTapered: string;
    profileSketch: string;
    dashSolid: string;
    dashDashed: string;
    dashDots: string;
    dashDenseDots: string;
    dashLong: string;
    dashAlignCorners: string;
    reseedVariation: string;

    // Effects
    dropShadow: string;
    innerShadow: string;
    blur: string;

    // MultiSelection
    multiSelectionTitle: string;
    selectedCount: string;
    totalNodes: string;
    transformGroup: string;

    // Primitives
    corners: string;
    cornersUnified: string;
    cornersIndependent: string;
    sides: string;
    points: string;
    innerRadius: string;
    regularPolygon: string;
    starShape: string;
    ellipseSector: string;
    ellipseArc: string;
    donutHole: string;

    // Pathfinder
    union: string;
    subtract: string;
    intersect: string;
    exclude: string;
    combine: string;
    fragment: string;

    // Nodes
    nodeSharp: string;
    nodeAsymmetric: string;
    nodeSmooth: string;
    nodeSymmetric: string;
    splitNode: string;
    joinNodes: string;
    vertexCoordinates: string;
    nodeType: string;
    nodeActions: string;
    segmentConversion: string;
    toLine: string;
    toCurve: string;

    // Guides & Grids
    gridIsometric: string;
    gridAxonometric: string;
    gridOrthogonal: string;
    convertToVector: string;
    lockGuidesAction: string;
    unlockGuidesAction: string;
    deleteGuide: string;
    deleteGuides: string;
    rulerOrigin: string;
    rulerScale: string;
    gridAlignment: string;
    activeGrids: string;
    guideInstructions: string;
    guideColor: string;
    guideActions: string;
    clearAllGuides: string;

    // Modals
    denseGridWarningTitle: string;
    denseGridWarningBody: string;
    continueVisualOnly: string;
    undoConversion: string;
  };
}
