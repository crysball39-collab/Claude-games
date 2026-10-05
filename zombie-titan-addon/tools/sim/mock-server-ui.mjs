// A stand-in for @minecraft/server-ui: forms record what they show, and tests answer them
// through `ui.answer(form, player)` (by default every form is closed without an answer).
export const ui = {
  shown: [],
  answer: () => ({ canceled: true }),
};

class Form {
  constructor(kind) {
    this.kind = kind;
    this.items = [];
    this.titleText = "";
    this.bodyText = "";
  }
  title(t) {
    this.titleText = t;
    return this;
  }
  body(t) {
    this.bodyText = t;
    return this;
  }
  label(t) {
    this.items.push({ type: "label", text: t });
    return this;
  }
  header(t) {
    this.items.push({ type: "header", text: t });
    return this;
  }
  divider() {
    this.items.push({ type: "divider" });
    return this;
  }
  button(text, icon) {
    if (icon !== undefined && !/^textures\//.test(icon)) throw new Error("bad button icon " + icon);
    this.items.push({ type: "button", text, icon });
    return this;
  }
  textField(label, placeholder, opts) {
    this.items.push({ type: "textField", text: label, placeholder, opts });
    return this;
  }
  dropdown(label, options, opts) {
    this.items.push({ type: "dropdown", text: label, options, opts });
    return this;
  }
  slider(label, min, max, opts) {
    this.items.push({ type: "slider", text: label, min, max, opts });
    return this;
  }
  toggle(label, opts) {
    this.items.push({ type: "toggle", text: label, opts });
    return this;
  }
  submitButton(t) {
    this.submit = t;
    return this;
  }
  show(player) {
    if (!player || player.typeId !== "minecraft:player") return Promise.reject(new Error("not a player"));
    ui.shown.push({ form: this, player });
    return Promise.resolve(ui.answer(this, player));
  }
}

export class ActionFormData extends Form {
  constructor() {
    super("action");
  }
}
export class ModalFormData extends Form {
  constructor() {
    super("modal");
  }
}
export class MessageFormData extends Form {
  constructor() {
    super("message");
  }
  button1(t) {
    return this.button(t);
  }
  button2(t) {
    return this.button(t);
  }
}
