class BaseElement {
  id: string;
  parent: string;
  name: string;
}

export class Folder extends BaseElement {
  type: string; // 'phase', 'building'
}

export class Doc extends BaseElement {
  ref: string;
}
