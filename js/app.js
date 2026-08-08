/* ============================================================
 * 丑团 · 应用逻辑(单页应用)
 * 视图:home 首页 | search 搜索 | shoplist 门店列表 | menu 菜单
 *      | checkout 下单 | track 配送 | placeholder 样子页
 * 恶搞只保留在价格/金额计算环节;界面整体逼真
 * ============================================================ */

(function () {
  "use strict";

  /* ---------- 全局状态 ---------- */
  const state = {
    view: "home",
    params: {},
    cart: [],          // [{ shopId, shopName, dish, qty, isFriend }]
    cartShopId: null,
    payAmount: 0,
    lastOrder: null,
    orders: [],          // 订单记录 [{id, shopName, items, amount, time, status}]
    track: { step: 0, timer: null, done: false, floating: false },  // 物流全局状态
    shopSort: "composite",
    cutleryIdx: 0,
    selectedCoupon: null,
    homeCoupons: [
      { id: "h1", amount: "¥15", name: "满 100 减 15" },
      { id: "h2", amount: "¥5", name: "新客立减" },
      { id: "h3", amount: "9折", name: "会员专享" },
    ],
  };

  const D = UT_DATA;

  /* ---------- 工具 ---------- */
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 0 : 1);

  function showModal(emoji, title, body, btnText, onOk) {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="modal">
        ${emoji ? `<div class="modal-emoji">${emoji}</div>` : ""}
        <div class="modal-title">${esc(title)}</div>
        <div class="modal-body">${esc(body)}</div>
        <button class="modal-btn">${esc(btnText || "知道了")}</button>
      </div>`;
    mask.querySelector(".modal-btn").addEventListener("click", () => {
      mask.remove();
      if (onOk) onOk();
    });
    mask.addEventListener("click", (e) => {
      if (e.target === mask) { mask.remove(); if (onOk) onOk(); }
    });
    $("#modal").appendChild(mask);
  }

  /* 彩蛋队列:依次弹对话框,关一个弹下一个,全部关闭后执行 done */
  function playEggs(eggs, done) {
    if (!eggs.length) { done(); return; }
    const e = eggs.shift();
    showModal("", e.title, e.body, e.btn || "好的", () => playEggs(eggs, done));
  }

  /* 朋友的店:朋友数据转店铺,招牌菜 = 朋友本人;配送费 99(恶搞在计算上) */
  function friendShop(f) {
    return {
      id: "fshop-" + f.id,
      name: f.name + "的店",
      logo: f.logoImg || f.emoji,        // 店铺展示图:有真实图用图,否则表情
      rating: "5.0",
      sales: "月售 3",
      tags: ["好友严选", f.tag],
      delivery: "配送 ¥99 · 30 分钟",
      deliveryFee: 99,
      distance: "0.9km",
      notice: "本店唯一菜品是老板本人,点单请三思。",
      isFriend: true,
      friend: f,
      menu: [
        {
          id: "f-" + f.id,
          name: f.name,
          icon: f.dishImg || null,     // 商品展示图:有真实图用图,否则表情
          emoji: f.emoji,
          category: "招牌",
          price: f.price,
          sales: f.status,
          desc: f.desc,
          options: f.options || [],
          isFriend: true,
          friend: f,
        },
      ],
    };
  }

  function allShops() {
    const shops = D.shops.map((s) => ({ ...s, isFriend: false }));
    D.friends.forEach((f) => shops.push(friendShop(f)));
    return shops;
  }

  function findShop(id) {
    return allShops().find((s) => s.id === id);
  }

  /* 购物车小计(含参数加价) */
  function cartTotal() {
    return state.cart.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
  }
  function cartCount() {
    return state.cart.reduce((sum, it) => sum + it.qty, 0);
  }
  function deliveryFee() {
    if (!state.cartShopId) return 3;
    const shop = findShop(state.cartShopId);
    return shop ? shop.deliveryFee : 3;
  }

  /* 当前可用券减免(满足门槛才生效) */
  function couponDiscount() {
    const c = state.selectedCoupon;
    if (!c) return 0;
    if (cartTotal() < c.min) return 0;
    return c.amount;
  }
  function finalTotal() {
    return cartTotal() + deliveryFee() - couponDiscount();
  }

  /* ---------- 公共组件 ---------- */
  function headerHTML(back, title) {
    return back
      ? `<div class="back-bar"><button class="back-btn" data-action="back">← 返回</button><span class="bb-title">${esc(title)}</span></div>`
      : `
        <div class="page-header">
          <div class="header-loc" data-action="edit-loc">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#7a5c00" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span>${esc(D.location)}</span><span class="loc-arrow">▾</span>
            <img class="app-logo" src="assets/logo.png" alt="${esc(D.appName)}" title="${esc(D.appName)}">
          </div>
          <div class="search-box">
            <span class="s-icon"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></span>
            <input class="s-input" id="top-search" placeholder="搜索店铺 / 搜索好友">
            <button class="s-btn" data-action="search">搜索</button>
          </div>
        </div>`;
  }

  function tabsHTML(active) {
    const tabs = [
      { id: "home", name: "首页" },
      { id: "youxuan", name: "优选" },
      { id: "order", name: "订单" },
      { id: "mine", name: "我的" },
    ];
    const TAB_ICONS = {
      home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
      youxuan: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8h12l-1.5 12h-9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
      order: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/></svg>',
      mine: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    };
    return `
      <nav class="bottom-tabs">
        ${tabs.map((t) => `
          <div class="tab ${t.id === active ? "active" : ""}" data-tab="${t.id}">
            <span class="t-emoji">${TAB_ICONS[t.id]}</span>${t.name}
          </div>`).join("")}
      </nav>`;
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    const grid = [
      { icon: "assets/icons/icon-waimai.svg", name: "外卖" },
      { icon: "assets/icons/icon-chaoshi.svg", name: "超市便利" },
      { icon: "assets/icons/icon-maicai.svg", name: "买菜" },
      { icon: "assets/icons/icon-shuiguo.svg", name: "水果" },
      { icon: "assets/icons/icon-meishi.svg", name: "美食" },
      { icon: "assets/icons/icon-yinpin.svg", name: "甜点饮品" },
      { icon: "assets/icons/icon-paotui.svg", name: "跑腿" },
      { icon: "assets/icons/icon-maiyao.svg", name: "买药" },
    ];
    const coupons = state.homeCoupons;
    const friends = D.friends;

    $("#app").innerHTML = `
      ${headerHTML(false)}
      <div class="grid">
        ${grid.map((g) => `
          <div class="grid-item" data-grid="${g.name}">
            <img class="grid-icon" src="${g.icon}" alt="${g.name}">
            <div class="grid-name">${g.name}</div>
          </div>`).join("")}
      </div>

      <div class="banner" data-action="banner">
        <div>
          <div class="banner-title">丑团会员日</div>
          <div class="banner-sub">会员下单 8 折起,满 30 减 5</div>
        </div>
      </div>

      <div class="section-title">领券中心<span class="more">更多 →</span></div>
      <div class="coupon-row">
        ${coupons.map((c) => `
          <div class="coupon" data-action="coupon" data-coupon-id="${c.id}">
            <div class="c-amount">${c.amount}</div>
            <div class="c-name">${c.name}</div>
          </div>`).join("")}
      </div>

      ${friends.length ? `
      <div class="section-title">好友严选<span class="more">搜索好友 →</span></div>
      <div class="friend-strip">
        ${friends.map((f) => `
          <div class="friend-card" data-shop="fshop-${f.id}">
            ${f.dishImg ? `<img class="f-emoji-img" src="${f.dishImg}" alt="${esc(f.name)}">` : `<div class="f-emoji">${f.emoji}</div>`}
            <div class="f-name">${esc(f.name)}</div>
            <div class="f-price">¥${money(f.price)} · ${esc(f.tag)}</div>
          </div>`).join("")}
      </div>` : ""}

      <div class="section-title">附近好店<span class="more">查看全部 →</span></div>
      <div class="shop-list">
        ${D.shops.slice(0, 8).map(shopCardHTML).join("")}
      </div>
      ${tabsHTML("home")}`;

    bindEvents();
  }

  function shopCardHTML(s) {
    const logo = String(s.logo || "");
    let logoImg;
    if (logo.startsWith("TEXT:")) {
      logoImg = `<div class="shop-logo text" style="background:${s.brandColor || "#999"}">${esc(String(s.logo).slice(5))}</div>`;
    } else if (/^(assets\/|\.?\/|https?:)/.test(logo)) {
      logoImg = `<img class="shop-logo" src="${s.logo}" alt="${esc(s.name)}" ${s.brandColor ? `style="background:${s.brandColor}"` : ""}>`;
    } else {
      logoImg = `<div class="shop-logo friend">${s.logo}</div>`;
    }
    return `
      <div class="shop-card" data-shop="${s.id}">
        ${logoImg}
        <div class="shop-info">
          <div class="shop-name">${esc(s.name)}</div>
          <div class="shop-rate">⭐ ${s.rating} · ${esc(s.sales)}</div>
          <div class="shop-tags">
            ${s.tags.map((t) => `<span class="shop-tag">${esc(t)}</span>`).join("")}
            <span class="shop-tag gray">${esc(s.delivery)}</span>
          </div>
          <div class="shop-delivery">${esc(s.distance)}</div>
        </div>
      </div>`;
  }

  /* ---------- 搜索 ---------- */
  function renderSearch(q) {
    const kw = (q || "").trim();
    const shops = allShops();
    const matchedShops = shops.filter((s) => s.name.includes(kw));
    const matchedFriends = D.friends.filter((f) => f.name.includes(kw));

    let resultHTML = "";
    if (!kw) {
      resultHTML = `<div class="placeholder-page"><div class="p-title">搜索店铺或好友</div><div class="p-body">试试输入“肯德基”“瑞幸”\n或者你朋友的名字</div></div>`;
    } else if (matchedFriends.length === 0 && matchedShops.length === 0) {
      resultHTML = `<div class="result-tip">未找到相关结果</div>
        <div class="placeholder-page"><div class="p-title">没有找到相关店铺</div><div class="p-body">${esc(D.texts.searchEmpty)}</div></div>`;
    } else {
      const parts = [];
      if (matchedFriends.length) {
        parts.push(`<div class="result-tip">${esc(D.texts.searchFriendPrefix)}</div>`);
        matchedFriends.forEach((f) => {
          const fs = friendShop(f);
          parts.push(`
            <div class="shop-list" style="margin-top:8px">
              <div class="shop-card" data-shop="${fs.id}">
                ${f.dishImg ? `<img class="shop-logo" src="${f.dishImg}" alt="${esc(f.name)}">` : `<div class="shop-logo friend">${f.emoji}</div>`}
                <div class="shop-info">
                  <div class="shop-name">${esc(f.name)} <span style="color:var(--price-red);font-size:12px">¥${money(f.price)}</span></div>
                  <div class="shop-rate">⭐ 5.0 · ${esc(f.status)}</div>
                  <div class="shop-tags">
                    <span class="shop-tag">好友严选</span>
                    <span class="shop-tag gray">点击进入店铺</span>
                  </div>
                </div>
              </div>
            </div>`);
        });
      }
      if (matchedShops.length) {
        parts.push(`<div class="result-tip">为您找到 ${matchedShops.length} 家店铺</div>`);
        parts.push(`<div class="shop-list" style="margin-top:8px">${matchedShops.map(shopCardHTML).join("")}</div>`);
      }
      resultHTML = parts.join("");
    }

    $("#app").innerHTML = `
      <div class="back-bar">
        <button class="back-btn" data-action="back">← 返回</button>
        <div class="search-box" style="flex:1;background:#f5f5f5">
          <span class="s-icon"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></span>
          <input class="s-input" id="top-search" placeholder="搜索店铺 / 搜索好友" value="${esc(kw)}">
          <button class="s-btn" data-action="search">搜索</button>
        </div>
      </div>
      ${resultHTML}`;
    bindEvents();
  }

  /* 排序辅助:从 "月售 9000+" / "1.1km" 提取数字 */
  function sortVal(str) {
    const m = String(str).match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  }

  const SORTS = [
    { key: "composite", name: "综合排序" },
    { key: "distance", name: "距离最近" },
    { key: "rating", name: "评分最高" },
    { key: "sales", name: "销量最高" },
  ];

  /* ---------- 门店列表 ---------- */
  function renderShopList() {
    const shops = D.shops.slice();
    if (state.shopSort === "distance") shops.sort((a, b) => sortVal(a.distance) - sortVal(b.distance));
    else if (state.shopSort === "rating") shops.sort((a, b) => sortVal(b.rating) - sortVal(a.rating));
    else if (state.shopSort === "sales") shops.sort((a, b) => sortVal(b.sales) - sortVal(a.sales));

    const friendHTML = D.friends.length ? `
      <div class="section-title">好友严选</div>
      <div class="shop-list">
        ${D.friends.map((f) => shopCardHTML(friendShop(f))).join("")}
      </div>` : "";

    $("#app").innerHTML = `
      ${headerHTML(true, "外卖")}
      <div class="sort-bar">
        ${SORTS.map((s) => `
          <div class="sort-item ${state.shopSort === s.key ? "active" : ""}" data-sort="${s.key}">${s.name}</div>`).join("")}
      </div>
      ${friendHTML}
      <div class="section-title">全部店铺</div>
      <div class="shop-list">
        ${shops.map(shopCardHTML).join("")}
      </div>
      ${tabsHTML("home")}`;
    bindEvents();
  }

  /* ---------- 菜单页 ---------- */
  function renderMenu(shopId) {
    const shop = findShop(shopId);
    if (!shop) { renderHome(); return; }

    /* 分类列表(保持菜品顺序) */
    const cats = [];
    shop.menu.forEach((d) => {
      const c = d.category || "招牌";
      if (!cats.includes(c)) cats.push(c);
    });

    $("#app").innerHTML = `
      <div class="back-bar">
        <button class="back-btn" data-action="back">← 返回</button>
        <span class="bb-title">${esc(shop.name)}</span>
      </div>
      <div class="menu-layout">
        <div class="menu-cats">
          ${cats.map((c, i) => `
            <div class="menu-cat ${i === 0 ? "active" : ""}" data-cat="${i}">${esc(c)}</div>`).join("")}
        </div>
        <div class="menu-body">
          <div class="menu-shop-head">
            <div class="menu-shop-name">${shop.isFriend ? (String(shop.logo).startsWith("assets/") ? `<img class="menu-shop-logo" src="${shop.logo}" alt="">` : shop.logo) : ""} ${esc(shop.name)}</div>
            <div class="menu-shop-notice">${esc(shop.notice)}</div>
          </div>
          ${cats.map((c, i) => `
            <div class="menu-group" id="menu-group-${i}">
              <div class="menu-group-title">${esc(c)}</div>
              ${shop.menu.filter((d) => (d.category || "招牌") === c).map((d) => dishHTML(shop, d)).join("")}
            </div>`).join("")}
        </div>
      </div>
      ${cartBarHTML()}`;
    bindEvents();
  }

  function dishHTML(shop, dish) {
    const totalQty = state.cart.filter((it) => it.dish.id === dish.id).reduce((s, it) => s + it.qty, 0);
    const img = dish.icon
      ? `<img class="dish-img" src="${dish.icon}" alt="${esc(dish.name)}">`
      : `<div class="dish-emoji friend">${dish.emoji}</div>`;
    return `
      <div class="dish" data-dish="${dish.id}">
        ${img}
        <div class="dish-info">
          <div class="dish-name">${esc(dish.name)}${dish.options && dish.options.length ? `<span class="dish-opt-tag">可选规格</span>` : ""}</div>
          <div class="dish-desc">${esc(dish.desc)}</div>
          <div class="dish-sales">${esc(dish.sales)}</div>
          <div class="dish-price">¥<span>${money(dish.price)}</span> <small>/份起</small></div>
        </div>
        ${totalQty ? `<span class="dish-count">×${totalQty}</span>` : ""}
        <button class="dish-add" data-add="${dish.id}">+</button>
      </div>`;
  }

  function cartBarHTML() {
    const count = cartCount();
    const total = cartTotal();
    const fee = deliveryFee();
    return `
      <div class="cart-bar">
        <div class="cart-icon">
          ${count ? `<span class="cart-badge">${count}</span>` : ""}
        </div>
        <div class="cart-total">
          ${total ? `¥${money(total + fee)} <small>含配送费 ¥${money(fee)}</small>` : "购物车还是空的"}
        </div>
        <button class="cart-submit" data-action="checkout">去结算</button>
      </div>`;
  }

  function addToCart(shop, dish, opts) {
    if (!state.cartShopId) { state.cartShopId = shop.id; }
    const unitPrice = dish.price + (opts ? opts.reduce((s, o) => s + o.delta, 0) : 0);
    const key = dish.id + (opts && opts.length ? "|" + opts.map((o) => o.label).join(",") : "");
    const hit = state.cart.find((it) => it.key === key);
    if (hit) { hit.qty++; } else {
      state.cart.push({ key, shopId: shop.id, shopName: shop.name, dish, qty: 1, isFriend: !!dish.isFriend, opts: opts || [], unitPrice });
    }
  }

  /* 商品参数选择面板 */
  function openOptionsPanel(shop, dish) {
    const selections = dish.options.map((o) => ({ name: o.name, choice: o.choices[0] }));
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    const closePanel = () => mask.remove();
    const renderPanel = () => {
      const unit = dish.price + selections.reduce((s, sel) => s + sel.choice.delta, 0);
      mask.innerHTML = `
        <div class="opt-panel">
          <div class="op-head">
            <span class="op-dish">${esc(dish.name)}</span>
            <span class="op-head-right">
              <span class="op-price">¥${money(unit)}</span>
              <button class="op-close" title="取消">×</button>
            </span>
          </div>
          ${dish.options.map((opt, gi) => `
            <div class="op-group">
              <div class="op-group-name">${esc(opt.name)}</div>
              <div class="op-choices">
                ${opt.choices.map((c, ci) => `
                  <div class="op-choice ${selections[gi].choice.label === c.label ? "selected" : ""}" data-g="${gi}" data-c="${ci}">
                    ${esc(c.label)}${c.delta ? ` <small>+¥${c.delta}</small>` : ""}
                  </div>`).join("")}
              </div>
            </div>`).join("")}
          <button class="btn-big op-confirm">加入购物车 ¥${money(unit)}</button>
        </div>`;
      mask.querySelectorAll(".op-choice").forEach((el) => {
        el.addEventListener("click", () => {
          selections[+el.dataset.g].choice = dish.options[+el.dataset.g].choices[+el.dataset.c];
          renderPanel();
        });
      });
      mask.querySelector(".op-confirm").addEventListener("click", () => {
        mask.remove();
        addToCart(shop, dish, selections.map((s) => ({ name: s.name, label: s.choice.label, delta: s.choice.delta })));
        renderMenu(shop.id);
      });
      mask.querySelector(".op-close").addEventListener("click", closePanel);
      /* 点击遮罩空白处关闭 */
      mask.addEventListener("click", (e) => {
        if (e.target === mask) closePanel();
      });
    };
    renderPanel();
    $("#modal").appendChild(mask);
  }

  function addDish(shop, dishId) {
    const dish = shop.menu.find((d) => d.id === dishId);
    if (!dish) return;
    if (state.cartShopId && state.cartShopId !== shop.id) {
      showModal("", "购物车有其它店铺的商品",
        "每单仅支持同一店铺的商品,请先结算当前购物车。", "去结算", () => {
          state.view = "checkout"; render();
        });
      return;
    }
    if (dish.options && dish.options.length) {
      openOptionsPanel(shop, dish);
      return;
    }
    addToCart(shop, dish, []);
    renderMenu(shop.id);
  }

  /* ---------- 下单页 ---------- */
  function renderCheckout() {
    if (state.cart.length === 0) {
      showModal("", "购物车还是空的", D.texts.cartEmpty, "去点餐", () => renderShopList());
      renderShopList();
      return;
    }
    const total = cartTotal();
    const fee = deliveryFee();
    const payMethods = [
      { id: "ugly", name: "丑团支付" },
      { id: "cloud", name: "云闪付" },
      { id: "wallet", name: "数字钱包" },
    ];

    $("#app").innerHTML = `
      <div class="back-bar">
        <button class="back-btn" data-action="back">← 返回</button>
        <span class="bb-title">确认订单</span>
      </div>
      <div class="checkout">
        <div class="co-card">
          <div class="co-row">
            <span class="k">收货地址</span>
            <span class="v">${esc(D.user.address)}</span>
          </div>
          <div class="co-row">
            <span class="k">联系人</span>
            <span class="v">${esc(D.user.name)} · ${esc(D.user.phone)}</span>
          </div>
          <div class="co-row">
            <span class="k">送达时间</span>
            <span class="v">尽快送达</span>
          </div>
        </div>

        <div class="co-card">
          <div class="co-row" data-action="coupon-select">
            <span class="k">优惠券</span>
            <span class="v" style="color:var(--price-red)">${state.selectedCoupon ? `已减 ¥${money(couponDiscount())}` : `${D.coupons.filter((c) => cartTotal() >= c.min).length} 张可用`} ▸</span>
          </div>
        </div>

        <div class="co-card">
          <div class="co-row" data-action="cutlery">
            <span class="k">餐具份数</span>
            <span class="v" id="cutlery-val">${["无需餐具", "1份", "2份", "3份", "4份以上"][state.cutleryIdx]} ▸</span>
          </div>
          <div class="co-row" style="padding-bottom:4px">
            <span class="k">订单备注</span>
          </div>
          <input class="remark-input" id="order-remark" placeholder="口味、偏好等要求(商家听不见)">
        </div>

        <div class="co-card">
          <div class="co-row" data-action="invoice">
            <span class="k">发票</span>
            <span class="v" style="color:var(--text-gray)">需要开发票 ▸</span>
          </div>
        </div>

        <div class="co-card">
          ${state.cart.map((it) => `
            <div class="co-price">
              <span>${it.isFriend ? it.dish.emoji : ""} ${esc(it.dish.name)} ×${it.qty}
                ${it.opts && it.opts.length ? `<span class="co-opts">${esc(it.opts.map((o) => `${o.name}:${o.label}`).join(" "))}</span>` : ""}
              </span>
              <span>¥${money(it.unitPrice * it.qty)}</span>
            </div>`).join("")}
          <div class="co-price"><span>配送费</span><span>¥${money(fee)}</span></div>
          ${couponDiscount() ? `<div class="co-price"><span>优惠券</span><span style="color:var(--price-red)">-¥${money(couponDiscount())}</span></div>` : ""}
          <div class="co-total"><span>合计</span><span class="amt">¥${money(finalTotal())}</span></div>
        </div>

        <div class="co-card">
          <div class="section-title" style="padding:0 0 6px">支付方式</div>
          ${payMethods.map((m, i) => `
            <div class="pay-method ${i === 0 ? "selected" : ""}" data-pay="${m.id}">
              <span class="pay-name">${m.name}</span>
              <span class="pay-check"></span>
            </div>`).join("")}
        </div>

        <button class="btn-big" data-action="submit-order">提交订单</button>
      </div>`;
    bindEvents();
  }

  /* ---------- 优惠券选择面板 ---------- */
  function openCouponPanel() {
    const total = cartTotal();
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="coupon-panel">
        <div class="cp-title">选择优惠券</div>
        <div class="cp-list">
          <div class="cp-item ${!state.selectedCoupon ? "selected" : ""}" data-coupon="none">
            <div class="cp-left">
              <div class="cp-amount" style="color:#999">不使用</div>
              <div class="cp-desc">不抵扣</div>
            </div>
            <div class="cp-right">${state.selectedCoupon ? "取消" : "已选"}</div>
          </div>
          ${D.coupons.map((c) => {
            const usable = total >= c.min;
            const sel = state.selectedCoupon && state.selectedCoupon.id === c.id;
            return `
              <div class="cp-item ${sel ? "selected" : ""} ${usable ? "" : "disabled"}" data-coupon="${c.id}">
                <div class="cp-left">
                  <div class="cp-amount">¥${c.amount}</div>
                  <div class="cp-desc">${esc(c.name)} · ${esc(c.desc)}</div>
                </div>
                <div class="cp-right">${sel ? "已选" : usable ? "选择" : `差 ¥${money(c.min - total)}`}</div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
    mask.querySelectorAll("[data-coupon]").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.dataset.coupon;
        if (id === "none") {
          state.selectedCoupon = null;
        } else {
          const c = D.coupons.find((x) => x.id === id);
          if (c && total >= c.min) state.selectedCoupon = c;
        }
        mask.remove();
        render();
      });
    });
    $("#modal").appendChild(mask);
  }

  /* ---------- 支付面板 ---------- */
  function openPayPanel(amount) {
    state.payAmount = amount;
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="pay-panel">
        <div class="pp-title">丑团支付</div>
        <div class="pp-amount">¥${money(amount)}</div>
        <div class="pwd-dots">
          ${Array.from({ length: 6 }, () => '<div class="pwd-dot"></div>').join("")}
        </div>
        <div class="pwd-keys">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="pwd-key" data-num="${n}">${n}</button>`).join("")}
          <button class="pwd-key func" data-func="clear">清除</button>
          <button class="pwd-key" data-num="0">0</button>
          <button class="pwd-key func" data-func="ok">确定</button>
        </div>
      </div>`;
    let pwd = "";
    const dots = mask.querySelectorAll(".pwd-dot");
    const clear = () => { pwd = ""; dots.forEach((d) => (d.textContent = "")); };
    const ok = () => {
      if (pwd.length < 6) {
        showModal("", "请输入 6 位支付密码", "支付密码为 6 位数字");
        return;
      }
      /* 收集本单触发的所有彩蛋(支付密码 + 特殊好友),依次弹出 */
      const eggs = [];
      if (pwd === "071122") {
        eggs.push({ title: "这是本王的生日", body: "你竟然知道我的生日呀。。。TvT", btn: "好的" });
      }
      if (pwd === "071124") {
        eggs.push({ title: "不准你支付", body: "你要减肥!", btn: "好的" });
      }
      /* 段嘉烁彩蛋:超 3 个外卖员超载,1-2 个路过 */
      const djQty = state.cart
        .filter((it) => it.dish.isFriend && it.dish.name === "段嘉烁")
        .reduce((s, it) => s + it.qty, 0);
      if (djQty >= 3) {
        eggs.push({ title: "段嘉烁", body: "你想干嘛,外卖员都超载了", btn: "好的" });
      } else if (djQty >= 1) {
        eggs.push({ title: "段嘉烁", body: "我只是经过,只是路过。", btn: "好的" });
      }
      /* 购买七安 */
      if (state.cart.some((it) => it.dish.isFriend && it.dish.name === "七安")) {
        eggs.push({ title: "七安", body: "你就是萨瓦迪卡星球的子民了", btn: "好的" });
      }
      /* 购买阿群 */
      if (state.cart.some((it) => it.dish.isFriend && it.dish.name === "阿群")) {
        eggs.push({ title: "阿群", body: "就这样吧", btn: "好的" });
      }
      /* 购买冰淇淋 */
      if (state.cart.some((it) => it.dish.isFriend && it.dish.name === "冰淇淋")) {
        eggs.push({ title: "冰淇淋", body: "嗯就是,买的人把钱转给我", btn: "好的" });
      }
      /* 购买松鼠 */
      if (state.cart.some((it) => it.dish.isFriend && it.dish.name === "松鼠")) {
        eggs.push({ title: "松鼠", body: "小小:同为松鼠为何不行", btn: "好的" });
      }
      /* 购买周田惟 */
      if (state.cart.some((it) => it.dish.isFriend && it.dish.name === "周田惟")) {
        eggs.push({ title: "周田惟", body: "老板不要忘情牛肉面了,给我来杯忘情水（黑发动漫男主哭泣表情）", btn: "好的" });
      }

      const finishPay = () => {
        state.track = { step: 0, timer: null, done: false, floating: false };
        const oldBall = document.getElementById("track-ball");
        if (oldBall) oldBall.remove();
        state.orders.unshift({
          id: "UT" + String(Math.floor(Math.random() * 900000) + 100000),
          shopName: state.cart[0] ? state.cart[0].shopName : "未知",
          items: state.cart.map((it) => ({ name: it.dish.name, qty: it.qty, opts: it.opts || [] })),
          amount,
          time: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
          status: "已完成",
        });
        state.lastOrder = {
          amount,
          shopName: state.cart[0] ? state.cart[0].shopName : "未知",
          items: state.cart.map((it) => it.dish.name),
          hasFriend: state.cart.some((it) => it.isFriend),
        };
        state.cart = [];
        state.cartShopId = null;
        state.view = "track";
        render();
      };
      mask.remove();
      if (eggs.length) {
        /* 有彩蛋:依次弹完,再进入外卖员运输界面 */
        playEggs(eggs, finishPay);
      } else {
        showModal("", D.texts.payOk, `已支付 ¥${money(amount)}`, "查看配送", finishPay);
      }
    };
    mask.querySelectorAll(".pwd-key").forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = btn.dataset.num;
        const fn = btn.dataset.func;
        if (num && pwd.length < 6) {
          pwd += num;
          dots[pwd.length - 1].textContent = "●";
          if (pwd.length === 6) setTimeout(ok, 300);
        } else if (fn === "clear") clear();
        else if (fn === "ok") ok();
      });
    });
    $("#modal").appendChild(mask);
  }

  /* ---------- 配送页 ---------- */
  function renderTrack() {
    const order = state.lastOrder;
    if (!order) { renderHome(); return; }
    const steps = D.riderSteps;
    const revealText = order.hasFriend ? D.texts.deliveryDone.friend : D.texts.deliveryDone.normal;

    $("#app").innerHTML = `
      <div class="back-bar">
        <button class="back-btn" data-action="back">← 返回</button>
        <span class="bb-title">订单配送</span>
      </div>
      <div class="track">
        <div class="track-map">
          <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
            <rect width="400" height="240" fill="#EFF4E6"/>
            <g stroke="#DFE8CF" stroke-width="12" stroke-linecap="round">
              <path d="M0 70 H400"/><path d="M0 170 H400"/>
              <path d="M120 0 V240"/><path d="M280 0 V240"/>
            </g>
            <g stroke="#D6E2C2" stroke-width="5">
              <path d="M0 120 H400"/><path d="M200 0 V240"/>
            </g>
            <path d="M70 200 C 150 165, 210 215, 300 130 S 345 70, 345 45" fill="none" stroke="#E8E1C9" stroke-width="9" stroke-linecap="round"/>
            <path id="track-route" d="M70 200 C 150 165, 210 215, 300 130 S 345 70, 345 45" fill="none" stroke="#FFB100" stroke-width="5" stroke-linecap="round"/>
            <circle cx="70" cy="200" r="13" fill="#07C160"/>
            <text x="70" y="228" font-size="11" fill="#666" text-anchor="middle">商家</text>
            <circle cx="345" cy="45" r="13" fill="#FA5151"/>
            <text x="345" y="26" font-size="11" fill="#666" text-anchor="middle">${esc(D.user.address)}</text>
            <g id="rider-group" transform="translate(70,200)">
              <circle r="16" fill="#FFE9A8" opacity="0.9"/>
              <circle r="9" fill="#FFB100" stroke="#fff" stroke-width="2"/>
            </g>
          </svg>
          <div class="map-tip">骑手正在配送中 · 预计 30 分钟</div>
        </div>
        <div class="track-status">
          <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="#FFB100" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/>
            <path d="M8.4 17h6.2M3 17H2v-6l3-4h7v10M13.5 7h3l3 4h-6"/>
            <path d="M9 7H6"/>
          </svg>
          <div style="font-size:16px;font-weight:800;margin-top:8px">配送中</div>
        </div>
        <div class="track-line"><div class="track-fill" id="track-fill"></div></div>
        <div class="track-msg" id="track-msg">${esc(steps[0])}</div>
        <div class="track-order" id="track-order">
          订单号:UT${String(Math.floor(Math.random() * 900000) + 100000)}<br>
          商家:${esc(order.shopName)}<br>
          商品:${esc(order.items.join("、"))}<br>
          实付:¥${money(order.amount)}
        </div>
        <div id="track-reveal"></div>
      </div>`;
    bindEvents();

    const fill = $("#track-fill");
    const msg = $("#track-msg");
    const revealBox = $("#track-reveal");
    const route = document.getElementById("track-route");
    const riderGroup = document.getElementById("rider-group");
    const routeLen = route ? route.getTotalLength() : 0;
    const moveRider = (prog) => {
      if (riderGroup && route && routeLen) {
        const pt = route.getPointAtLength(routeLen * prog);
        riderGroup.style.transition = "transform 1.15s ease";
        riderGroup.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
    };
    const syncTrackUI = () => {
      const p = state.track.done ? 1 : Math.min(1, state.track.step / steps.length);
      fill.style.width = (p * 100) + "%";
      moveRider(p);
      msg.textContent = state.track.done ? "已送达!" : steps[Math.min(state.track.step, steps.length - 1)];
    };
    if (state.track.done) {
      syncTrackUI();
      showTrackReveal(revealBox, revealText);
    } else {
      syncTrackUI();
      startTrackTimer();
    }
  }

  /* 全局配送推进:离开物流页(悬浮球)后继续 */
  function startTrackTimer() {
    if (state.track.timer || state.track.done) return;
    state.track.timer = setInterval(advanceTrack, 1200);
  }
  function advanceTrack() {
    const steps = D.riderSteps;
    state.track.step++;
    if (state.track.step >= steps.length) {
      clearInterval(state.track.timer);
      state.track.timer = null;
      state.track.done = true;
      if (state.track.floating) {
        updateFloatingBall();
        showModal("", "外卖已送达", "您的订单已完成配送,快去看看!", "查看订单", () => {
          state.track.floating = false;
          const b = document.getElementById("track-ball");
          if (b) b.remove();
          state.view = "track"; render();
        });
      } else if (state.view === "track") {
        const revealBox = $("#track-reveal");
        const order = state.lastOrder;
        if (revealBox && order) {
          showTrackReveal(revealBox, order.hasFriend ? D.texts.deliveryDone.friend : D.texts.deliveryDone.normal);
        }
      }
      return;
    }
    if (state.view === "track") {
      const fill = $("#track-fill");
      const msg = $("#track-msg");
      if (fill && msg) {
        fill.style.width = Math.min(100, (state.track.step / steps.length) * 100) + "%";
        msg.textContent = steps[state.track.step];
        const route = document.getElementById("track-route");
        const riderGroup = document.getElementById("rider-group");
        if (route && riderGroup) {
          const len = route.getTotalLength();
          const pt = route.getPointAtLength(len * (state.track.step / steps.length));
          riderGroup.style.transition = "transform 1.15s ease";
          riderGroup.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
        }
      }
    }
    if (state.track.floating) updateFloatingBall();
  }
  function showTrackReveal(revealBox, revealText) {
    revealBox.innerHTML = `
      <div class="reveal">
        
        <div class="rv-title">订单已完成</div>
        <div class="rv-body">${esc(revealText)}</div>
        <button class="btn-big" data-action="view-order" style="margin-top:14px">查看订单</button>
      </div>`;
    bindEvents();
  }

  /* 物流悬浮球(返回后继续显示进度) */
  function ensureFloatingBall() {
    let ball = document.getElementById("track-ball");
    if (ball) return ball;
    ball = document.createElement("div");
    ball.id = "track-ball";
    ball.className = "track-ball";
    ball.innerHTML = `<span class="tb-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#7a5c00" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/><path d="M8.4 17h6.2M3 17H2v-6l3-4h7v10M13.5 7h3l3 4h-6"/><path d="M9 7H6"/></svg></span><span class="tb-pct">0%</span>`;
    document.body.appendChild(ball);
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    ball.addEventListener("pointerdown", (e) => {
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = ball.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      try { ball.setPointerCapture(e.pointerId); } catch (err) {}
    });
    ball.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      ball.style.left = (e.clientX - ox) + "px";
      ball.style.top = (e.clientY - oy) + "px";
      ball.style.right = "auto";
      ball.style.bottom = "auto";
    });
    ball.addEventListener("pointerup", () => {
      dragging = false;
      if (!moved) {
        state.track.floating = false;
        ball.remove();
        state.view = "track"; render();
      }
    });
    return ball;
  }
  function updateFloatingBall() {
    const ball = document.getElementById("track-ball");
    if (!ball) return;
    const p = ball.querySelector(".tb-pct");
    if (state.track.done) {
      p.textContent = "已送达";
      ball.classList.add("done");
    } else {
      p.textContent = Math.min(99, Math.round((state.track.step / D.riderSteps.length) * 100)) + "%";
    }
  }

  /* ---------- 商品详情页 ---------- */
  function renderDishDetail(shopId, dishId) {
    const shop = findShop(shopId);
    const dish = shop ? shop.menu.find((d) => d.id === dishId) : null;
    if (!shop || !dish) { renderHome(); return; }

    const selections = (dish.options || []).map((o) => ({ name: o.name, choice: o.choices[0] }));
    let qty = 1;
    const unit = () => dish.price + selections.reduce((s, sel) => s + sel.choice.delta, 0);

    const draw = () => {
      $("#app").innerHTML = `
        <div class="back-bar">
          <button class="back-btn" data-action="back">← 返回</button>
          <span class="bb-title">商品详情</span>
        </div>
        <div class="detail">
          ${dish.isFriend
            ? (dish.icon
                ? `<img class="detail-img" src="${dish.icon}" alt="${esc(dish.name)}">`
                : `<div class="detail-img friend">${dish.emoji}</div>`)
            : `<img class="detail-img" src="${dish.icon}" alt="${esc(dish.name)}">`}
          <div class="detail-body">
            <div class="detail-name">${esc(dish.name)}</div>
            <div class="detail-sales">${esc(dish.sales)} · 评分 ${shop.rating}</div>
            <div class="detail-desc">${esc(dish.desc)}</div>
            <div class="detail-price">¥<span>${money(unit())}</span> <small>/${dish.options && dish.options.length ? "份起" : "份"}</small></div>
          </div>
          ${dish.options ? dish.options.map((opt, gi) => `
            <div class="detail-group">
              <div class="op-group-name">${esc(opt.name)}</div>
              <div class="op-choices">
                ${opt.choices.map((c, ci) => `
                  <div class="op-choice ${selections[gi].choice.label === c.label ? "selected" : ""}" data-dg="${gi}" data-dc="${ci}">
                    ${esc(c.label)}${c.delta ? ` <small>+¥${c.delta}</small>` : ""}
                  </div>`).join("")}
              </div>
            </div>`).join("") : ""}
          <div class="qty-row">
            <span>购买数量</span>
            <div class="qty-ctrl">
              <button class="qty-btn" data-qty="minus">−</button>
              <span class="qty-num">${qty}</span>
              <button class="qty-btn" data-qty="plus">+</button>
            </div>
          </div>
        </div>
        <div class="cart-bar">
          <div class="cart-total" style="margin-left:0">合计 ¥${money(unit() * qty)}</div>
          <button class="cart-submit" data-action="detail-add">加入购物车</button>
        </div>`;
      bindEvents();

      /* 详情页专用事件(每次重建后重新绑定) */
      const app = $("#app");
      app.querySelectorAll("[data-dg]").forEach((el) => {
        el.addEventListener("click", () => {
          selections[+el.dataset.dg].choice = dish.options[+el.dataset.dg].choices[+el.dataset.dc];
          draw();
        });
      });
      app.querySelectorAll("[data-qty]").forEach((el) => {
        el.addEventListener("click", () => {
          if (el.dataset.qty === "minus" && qty > 1) qty--;
          if (el.dataset.qty === "plus") qty++;
          draw();
        });
      });
      app.querySelectorAll("[data-action='detail-add']").forEach((el) => {
        el.addEventListener("click", () => {
          if (state.cartShopId && state.cartShopId !== shop.id) {
            showModal("", "购物车有其它店铺的商品", "每单仅支持同一店铺的商品,请先结算当前购物车。", "去结算", () => {
              state.view = "checkout"; render();
            });
            return;
          }
          const opts = selections.map((s) => ({ name: s.name, label: s.choice.label, delta: s.choice.delta }));
          for (let i = 0; i < qty; i++) addToCart(shop, dish, opts);
          showModal("", "已加入购物车", `${esc(dish.name)} ×${qty} 已加入`, "继续选购", () => {
            state.view = "menu"; state.params = { shopId: shop.id }; render();
          });
        });
      });
    };
    draw();
  }

  /* ---------- 样子页 ---------- */
  function renderPlaceholder(key) {
    const pages = {
      youxuan: { title: "丑团优选", body: D.texts.youxuan },
      order: { title: "我的订单", body: D.texts.orderPage },
      mine: { title: "个人中心", body: D.texts.myPage },
    };
    const p = pages[key] || pages.youxuan;
    $("#app").innerHTML = `
      ${headerHTML(false)}
      <div class="placeholder-page">
        ${p.emoji ? `<div class="p-emoji">${p.emoji}</div>` : ""}
        <div class="p-title">${p.title}</div>
        <div class="p-body">${esc(p.body)}</div>
      </div>
      ${tabsHTML(key)}`;
    bindEvents();
  }

  /* ---------- 订单记录页 ---------- */
  function renderOrder() {
    const list = state.orders;
    $("#app").innerHTML = `
      ${headerHTML(false, "我的订单")}
      <div class="order-page">
        ${list.length ? list.map((o) => `
          <div class="order-card" data-order="${o.id}">
            <div class="oc-top">
              <span class="oc-shop">${esc(o.shopName)}</span>
              <span class="oc-status">${esc(o.status)}</span>
            </div>
            <div class="oc-items">${esc(o.items.map((it) => it.name + (it.qty > 1 ? " ×" + it.qty : "")).join("、"))}</div>
            <div class="oc-bottom">
              <span class="oc-time">${esc(o.time)}</span>
              <span class="oc-amount">¥${money(o.amount)}</span>
            </div>
          </div>`).join("")
        : `<div class="placeholder-page"><div class="p-title">暂无订单</div><div class="p-body">${esc(D.texts.orderPage)}</div></div>`}
      </div>
      ${tabsHTML("order")}`;
    bindEvents();
  }

  function renderOrderDetail(orderId) {
    const o = state.orders.find((x) => x.id === orderId);
    if (!o) { renderOrder(); return; }
    $("#app").innerHTML = `
      <div class="back-bar">
        <button class="back-btn" data-action="back-order">← 返回</button>
        <span class="bb-title">订单详情</span>
      </div>
      <div class="order-detail">
        <div class="od-status">${esc(o.status)}</div>
        <div class="od-card">
          <div class="od-row"><span>订单号</span><span>${o.id}</span></div>
          <div class="od-row"><span>下单时间</span><span>${esc(o.time)}</span></div>
          <div class="od-row"><span>商家</span><span>${esc(o.shopName)}</span></div>
          <div class="od-row"><span>配送地址</span><span>${esc(D.user.address)}</span></div>
        </div>
        <div class="od-card">
          ${o.items.map((it) => `
            <div class="od-row">
              <span>${esc(it.name)}${it.opts && it.opts.length ? ` <small class="od-opts">(${esc(it.opts.map((x) => x.label).join(" / "))})</small>` : ""} ×${it.qty}</span>
            </div>`).join("")}
          <div class="od-row od-total"><span>实付</span><span class="od-money">¥${money(o.amount)}</span></div>
        </div>
      </div>`;
    bindEvents();
  }

  /* 地址修改弹窗(首页左上角定位栏 / 个人中心收货地址) */
  function openAddressModal() {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="addr-modal">
        <div class="addr-title">修改收货地址</div>
        <input class="addr-input" id="addr-input" value="${esc(D.user.address)}" maxlength="30" placeholder="请输入新地址">
        <div class="addr-btns">
          <button class="addr-btn cancel" id="addr-cancel">取消</button>
          <button class="addr-btn ok" id="addr-ok">保存</button>
        </div>
      </div>`;
    $("#modal").appendChild(mask);
    const input = mask.querySelector("#addr-input");
    input.focus();
    input.select();
    const close = () => mask.remove();
    mask.querySelector("#addr-cancel").addEventListener("click", close);
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    mask.querySelector("#addr-ok").addEventListener("click", () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      D.user.address = v;
      D.location = v;
      close();
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") mask.querySelector("#addr-ok").click();
    });
  }

  /* ---------- 个人中心 ---------- */
  function renderMine() {
    const u = D.user;
    const couponCount = state.homeCoupons.length + D.coupons.length;
    $("#app").innerHTML = `
      ${headerHTML(false)}
      <div class="mine-page">
        <div class="mine-card">
          <div class="mine-avatar">
            <svg viewBox="0 0 64 64" width="58" height="58">
              <circle cx="32" cy="32" r="32" fill="#FFD98A"/>
              <circle cx="32" cy="25" r="11" fill="#fff"/>
              <path d="M11 55c2-11 11-16 21-16s19 5 21 16" fill="#fff"/>
            </svg>
          </div>
          <div class="mine-info">
            <div class="mine-name">${esc(u.name)}</div>
            <div class="mine-level">${esc(u.level || "Lv.1")}</div>
            <div class="mine-phone">${esc(u.phone)}</div>
          </div>
        </div>
        <div class="mine-menu">
          <div class="mine-item" data-action="mine-order">
            <span class="mi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/></svg></span>
            我的订单<span class="mi-arrow">›</span>
          </div>
          <div class="mine-item" data-action="edit-loc">
            <span class="mi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
            收货地址<span class="mi-val">${esc(u.address)}</span><span class="mi-arrow">›</span>
          </div>
          <div class="mine-item">
            <span class="mi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-5 9 5v11H3z"/><path d="M9 20v-8h6v8"/></svg></span>
            我的优惠券<span class="mi-val">${couponCount} 张</span><span class="mi-arrow">›</span>
          </div>
          <div class="mine-item">
            <span class="mi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg></span>
            客服热线<span class="mi-val">1010-8888</span><span class="mi-arrow">›</span>
          </div>
          <div class="mine-item">
            <span class="mi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/></svg></span>
            设置<span class="mi-arrow">›</span>
          </div>
        </div>
      </div>
      ${tabsHTML("mine")}`;
    bindEvents();
  }

  /* ---------- 渲染入口 ---------- */
  function render() {
    switch (state.view) {
      case "home": renderHome(); break;
      case "search": renderSearch(state.params.q); break;
      case "shoplist": renderShopList(); break;
      case "menu": renderMenu(state.params.shopId); break;
      case "dishDetail": renderDishDetail(state.params.shopId, state.params.dishId); break;
      case "checkout": renderCheckout(); break;
      case "track": renderTrack(); break;
      case "order": renderOrder(); break;
      case "orderDetail": renderOrderDetail(state.params.orderId); break;
      case "mine": renderMine(); break;
      case "placeholder": renderPlaceholder(state.params.key); break;
      default: renderHome();
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    const app = $("#app");

    /* 返回 */
    app.querySelectorAll("[data-action='back']").forEach((b) => {
      b.addEventListener("click", () => {
        if (state.view === "checkout") {
          state.view = "menu"; state.params = { shopId: state.cartShopId || D.shops[0].id };
        } else if (state.view === "dishDetail") {
          state.view = "menu";
        } else if (state.view === "menu") {
          state.view = "shoplist";
        } else if (state.view === "search") {
          state.view = "home";
        } else if (state.view === "track") {
          /* 配送中返回:变悬浮球继续配送 */
          if (!state.track.done) {
            state.track.floating = true;
            ensureFloatingBall();
            updateFloatingBall();
          }
          state.view = "home";
        } else {
          state.view = "home";
        }
        render();
      });
    });

    /* 搜索提交 */
    const doSearch = () => {
      const input = $("#top-search");
      if (!input) return;
      const q = input.value.trim();
      state.view = "search"; state.params = { q };
      render();
    };
    app.querySelectorAll("[data-action='search']").forEach((b) => b.addEventListener("click", doSearch));
    const input = $("#top-search");
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    /* 金刚区 */
    app.querySelectorAll("[data-grid]").forEach((item) => {
      item.addEventListener("click", () => {
        if (item.dataset.grid === "外卖") { state.view = "shoplist"; render(); }
        else showModal("", "敬请期待", D.texts.notOpen, "好的");
      });
    });

    /* 门店排序 */
    app.querySelectorAll("[data-sort]").forEach((s) => {
      s.addEventListener("click", () => {
        state.shopSort = s.dataset.sort;
        render();
      });
    });

    /* 菜单分类切换 */
    app.querySelectorAll("[data-cat]").forEach((cat) => {
      cat.addEventListener("click", () => {
        app.querySelectorAll("[data-cat]").forEach((c) => c.classList.remove("active"));
        cat.classList.add("active");
        const target = $("#menu-group-" + cat.dataset.cat);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    /* banner / 优惠券领取 */
    app.querySelectorAll("[data-action='banner']").forEach((b) =>
      b.addEventListener("click", () => showModal("", "丑团会员日", "开通会员享 8 折起,首月 0.1 元", "立即开通")));
    app.querySelectorAll("[data-action='coupon']").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.couponId;
        showModal("", "领取成功", "优惠券已放入卡包\n结算时可选择使用", "好的", () => {
          state.homeCoupons = state.homeCoupons.filter((c) => c.id !== id);
          render();
        });
      }));

    /* 进店 */
    app.querySelectorAll("[data-shop]").forEach((card) => {
      card.addEventListener("click", () => {
        state.view = "menu"; state.params = { shopId: card.dataset.shop };
        render();
      });
    });

    /* 加购 */
    app.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const shop = findShop(state.params.shopId);
        if (shop) addDish(shop, btn.dataset.add);
      });
    });

    /* 点菜品进详情 */
    app.querySelectorAll("[data-dish]").forEach((card) => {
      card.addEventListener("click", () => {
        state.view = "dishDetail";
        state.params = { shopId: state.params.shopId, dishId: card.dataset.dish };
        render();
      });
    });

    /* 去结算 */
    app.querySelectorAll("[data-action='checkout']").forEach((b) => {
      b.addEventListener("click", () => {
        if (state.cart.length === 0) {
          showModal("", "购物车还是空的", D.texts.cartEmpty, "去点餐");
          return;
        }
        state.view = "checkout"; render();
      });
    });

    /* 支付方式选择 */
    app.querySelectorAll("[data-pay]").forEach((m) => {
      m.addEventListener("click", () => {
        app.querySelectorAll("[data-pay]").forEach((x) => x.classList.remove("selected"));
        m.classList.add("selected");
      });
    });

    /* 餐具份数切换 */
    const CUTLERY = ["无需餐具", "1份", "2份", "3份", "4份以上"];
    app.querySelectorAll("[data-action='cutlery']").forEach((c) => {
      c.addEventListener("click", () => {
        state.cutleryIdx = (state.cutleryIdx + 1) % CUTLERY.length;
        const el = $("#cutlery-val");
        if (el) el.textContent = CUTLERY[state.cutleryIdx] + " ▸";
      });
    });

    /* 发票 */
    app.querySelectorAll("[data-action='invoice']").forEach((c) => {
      c.addEventListener("click", () => {
        showModal("", "电子发票", "发票将在订单完成后开具\n抬头:随便填的有限公司", "好的");
      });
    });

    /* 提交订单 */
    app.querySelectorAll("[data-action='submit-order']").forEach((b) => {
      b.addEventListener("click", () => {
        openPayPanel(finalTotal());
      });
    });

    /* 优惠券选择 */
    app.querySelectorAll("[data-action='coupon-select']").forEach((b) => {
      b.addEventListener("click", openCouponPanel);
    });

    /* 查看订单(露馅后) */
    app.querySelectorAll("[data-action='view-order']").forEach((b) => {
      b.addEventListener("click", () => {
        showModal("", "订单详情", "订单编号:UT" + Math.floor(Math.random() * 900000 + 100000) + "\n状态:已完成\n备注:本次交易未产生实际扣款", "回首页", () => {
          state.view = "home"; render();
        });
      });
    });

    /* 底部 tab */
    app.querySelectorAll("[data-tab]").forEach((t) => {
      t.addEventListener("click", () => {
        const id = t.dataset.tab;
        if (id === "home") { state.view = "home"; render(); }
        else if (id === "youxuan") { state.view = "placeholder"; state.params = { key: "youxuan" }; render(); }
        else if (id === "order") { state.view = "order"; render(); }
        else if (id === "mine") { state.view = "mine"; render(); }
      });
    });

    /* 订单记录 -> 详情 */
    app.querySelectorAll("[data-order]").forEach((c) => {
      c.addEventListener("click", () => {
        state.view = "orderDetail";
        state.params = { orderId: c.dataset.order };
        render();
      });
    });
    /* 订单记录 -> 详情 */
    app.querySelectorAll("[data-order]").forEach((c) => {
      c.addEventListener("click", () => {
        state.view = "orderDetail";
        state.params = { orderId: c.dataset.order };
        render();
      });
    });
    app.querySelectorAll("[data-action='back-order']").forEach((b) => {
      b.addEventListener("click", () => { state.view = "order"; render(); });
    });
    /* 地址修改(首页定位栏 / 个人中心收货地址) */
    app.querySelectorAll("[data-action='edit-loc']").forEach((el) => {
      el.addEventListener("click", openAddressModal);
    });
    /* 个人中心 -> 我的订单 */
    app.querySelectorAll("[data-action='mine-order']").forEach((el) => {
      el.addEventListener("click", () => { state.view = "order"; render(); });
    });
  }

  /* ---------- 启动 ---------- */
  render();
})();
