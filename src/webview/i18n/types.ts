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
    gridAlignOrigin: string;
    gridAlignOriginTooltip: string;
    gridAlignCenter: string;
    gridAlignCenterTooltip: string;
    zoomResetTooltip: string;
    rulerCornerTooltip: string;
    currentTool: string;
    themeToggleTooltip: string;
  };

  // Mini HUD (Floating pill)
  miniHud: {
    move: string;
    scale: string;
    rotate: string;
    moveTitle: string;
    scaleTitle: string;
    rotateTitle: string;
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
    // No Selection State
    noSelectionTitle: string;
    noSelectionHint: string;

    // Root SVG Attributes
    rootFill: string;
    rootStroke: string;
    rootWidth: string;
    linecap: string;
    linejoin: string;
    rootFillTooltip: string;
    rootStrokeTooltip: string;
    rootWidthTooltip: string;
    linecapTooltip: string;
    linejoinTooltip: string;
    undefinedDefault: string;

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
    decreaseStrokeWidth: string;
    increaseStrokeWidth: string;
    hairlineStrokeWidth: string;
    strokeCap: string;
    strokeJoin: string;
    strokeMiter: string;
    strokeDash: string;
    strokeMarkers: string;
    strokeToPath: string;
    strokeToPathAction: string;
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
    amplitude: string;
    roughness: string;
    strokeLayers: string;
    addLayer: string;

    // Markers
    markersRestrictedWarning: string;
    convertForMarkers: string;
    markerStart: string;
    markerMid: string;
    markerEnd: string;
    markerAlign: string;
    markerTip: string;
    markerExtend: string;
    markerOffset: string;
    markerSize: string;
    markerRelative: string;
    markerAbsolute: string;
    markerAuto: string;

    // Effects
    dropShadow: string;
    innerShadow: string;
    blur: string;

    // MultiSelection & Batch
    multiSelectionTitle: string;
    selectedCount: string;
    totalNodes: string;
    transformGroup: string;
    batch: string;
    batchFill: string;
    batchStroke: string;

    // Primitives & Geometry
    corners: string;
    cornersUnified: string;
    cornersIndependent: string;
    unit: string;
    unitTooltip: string;
    cornerModeTooltip: string;
    radiusTooltip: string;
    pill: string;
    topCorners: string;
    bottomCorners: string;
    unifyCorners: string;
    copyTL: string;
    invertCorners: string;
    center: string;
    radii: string;
    pie: string;
    arc: string;
    donut: string;
    partialDonut: string;
    startAngle: string;
    endAngle: string;
    startAngleAbbr: string;
    endAngleAbbr: string;
    holeRatio: string;
    rotate90: string;
    sides: string;
    points: string;
    innerRadius: string;
    regularPolygon: string;
    regularPolygonLados: string;
    starShape: string;
    outerStar: string;
    innerStar: string;
    toRegularPolygon: string;
    depthEdge: string;
    sharp: string;
    medium: string;
    outer: string;
    ellipseSector: string;
    ellipseArc: string;
    donutHole: string;

    // Line & Polyline
    straightLine: string;
    startPoint: string;
    startPointTitle: string;
    startCoordXTitle: string;
    startCoordYTitle: string;
    endPoint: string;
    endPointTitle: string;
    endCoordXTitle: string;
    endCoordYTitle: string;
    reversePoints: string;
    reversePointsTitle: string;
    vertices: string;
    pointsLabel: string;
    pointsZero: string;

    // Pathfinder & Booleans
    union: string;
    subtract: string;
    intersect: string;
    exclude: string;
    combine: string;
    fragment: string;
    booleanOpsTitle: string;
    boolUnionTooltip: string;
    boolSubtractTooltip: string;
    boolIntersectTooltip: string;
    boolExcludeTooltip: string;
    boolCombineTooltip: string;
    boolFragmentTooltip: string;

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
    bezierHandles: string;
    handleIn: string;
    handleOut: string;
    closeCurve: string;

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
    gridAlignOriginCanvas: string;
    gridAlignCenterCanvas: string;
    activeGrids: string;
    guideInstructions: string;
    guideInstructionsBody: string;
    guideColor: string;
    guideActions: string;
    clearAllGuides: string;
    guide: string;
    guideVertical: string;
    guideHorizontal: string;
    guideAngled: string;
    guidesSelected: string;
    noActiveGuides: string;
    stepPx: string;

    // Swatches
    globalSwatches: string;
    extract: string;
    extractTooltip: string;
    newSwatch: string;
    newSwatchTooltip: string;
    assignTo: string;
    tint: string;
    unlink: string;
    unlinkTooltip: string;
    editSwatchTitle: string;
    deleteSwatch: string;
    saveSwatch: string;

    // Stroke Layers
    strokeLayersTitle: string;
    emptyLayersHint: string;
    layerLabel: string;
    layerBelow: string;
    layerAbove: string;
    deleteLayerTooltip: string;

    // Blend
    parametricBlend: string;
    createBlend: string;
    live: string;
    steps: string;
    startNode0: string;
    figureA: string;
    figureB: string;
    twisting: string;
    reversedTwist: string;
    directTwist: string;
    expandBlend: string;
    releaseBlend: string;

    // Free Distort & Homography
    freeDistort: string;
    homography2D: string;
    corner: string;
    resetCorner: string;
    resetAll: string;
    skew: string;
    resetSkew: string;
    warpArc: string;
    curvature: string;
    axis: string;
    horizontal: string;
    vertical: string;

    // Modals
    denseGridWarningTitle: string;
    denseGridWarningBody: string;
    continueVisualOnly: string;
    undoConversion: string;
  };

  // Quick Help
  quickHelp: {
    header: string;
  };

  // Vector Explorer
  explorer: {
    title: string;
    closeTitle: string;
    branchContext: string;
    branchDocument: string;
    gridsSubgroup: string;
    guidesSubgroup: string;
    artboardSubgroup: string;
    noGuidesHint: string;
    emptyCanvasHint: string;
    guideBadge: string;
    recenterViewBox: string;
  };

  // Image Optimization Modal (Save for Web inspired)
  imageOptimization: {
    modalTitle: string;
    originalLabel: string;
    previewLabel: string;
    savingsBadge: string;
    storageSection: string;
    storageLinked: string;
    storageLinkedHint: string;
    storageEmbedded: string;
    storageEmbeddedHint: string;
    formatSection: string;
    colorSection: string;
    colorModeRgb: string;
    colorModePalette: string;
    paletteColors: string;
    transparency: string;
    matteColor: string;
    advancedSection: string;
    quality: string;
    smoothing: string;
    transformSection: string;
    width: string;
    height: string;
    percent: string;
    maintainAspect: string;
    zoomIn: string;
    zoomOut: string;
    zoomFit: string;
    zoom100: string;
    panTool: string;
    keepOriginal: string;
    saveAndInsert: string;
    cancel: string;
    toolImage: string;
    toolImageTooltip: string;
    toolImageBgTooltip: string;
    choiceTitle: string;
    choiceQuestion: string;
    choiceLinkedTitle: string;
    choiceLinkedDesc: string;
    choiceEmbeddedTitle: string;
    choiceEmbeddedDesc: string;
    choiceOptimizeBtn: string;
    recommendedBadge: string;
    largeImageWarning: string;
  };
}
