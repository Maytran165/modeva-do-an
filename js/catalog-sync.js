/* Modeva — đồng bộ danh mục / giá storefront với modeva_dash_products (Admin/Staff) */
(function () {
  'use strict';

  var K_PRODUCTS = 'modeva_dash_products';
  var K_CATEGORIES = 'modeva_dash_categories';

  function escAttr (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney (n) {
    return new Intl.NumberFormat('vi-VN').format(n) + '₫';
  }

  function defaultCategories () {
    return [
      { id: 'nam', name: 'Thời trang Nam', parent: null },
      { id: 'nam-ao', name: 'Áo nam', parent: 'nam' },
      { id: 'nam-quan', name: 'Quần nam', parent: 'nam' },
      { id: 'nu', name: 'Thời trang Nữ', parent: null },
      { id: 'nu-ao', name: 'Áo nữ', parent: 'nu' },
      { id: 'nu-vay', name: 'Váy', parent: 'nu' },
      { id: 'tre', name: 'Trẻ em', parent: null },
      { id: 'tre-be-trai', name: 'Bé trai', parent: 'tre' },
      { id: 'tre-be-gai', name: 'Bé gái', parent: 'tre' },
      { id: 'phu-kien', name: 'Phụ kiện', parent: null },
      { id: 'phu-kien-giay', name: 'Giày dép', parent: 'phu-kien' },
      { id: 'phu-kien-tui', name: 'Túi xách', parent: 'phu-kien' },
      { id: 'phu-kien-dong-ho', name: 'Đồng hồ', parent: 'phu-kien' }
    ];
  }

  function defaultProducts () {
    return [
      {
        id: 'p1',
        name: 'Áo sơ mi linen',
        cat: 'nam-ao',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Trắng', 'Be', 'Xanh'],
        price: 890000,
        salePrice: 690000,
        images: 3,
        imageUrl: '../images/ao-so-mi-linen.png',
        lineLabel: 'Nam • Áo nam',
        newest: 101
      },
      {
        id: 'p2',
        name: 'Quần tây slim',
        cat: 'nam-quan',
        sizes: ['30', '32', '34', '36', '38', '40'],
        colors: ['Đen', 'Navy', 'Be'],
        price: 1190000,
        salePrice: null,
        images: 4,
        imageUrl: '../images/quan-tay-slim.png',
        lineLabel: 'Nam • Quần nam',
        newest: 100
      },
      {
        id: 'p3',
        name: 'Váy midi lụa',
        cat: 'nu-vay',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Hồng', 'Đen', 'Be'],
        price: 1590000,
        salePrice: 1290000,
        images: 5,
        imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
        lineLabel: 'Nữ • Váy',
        newest: 107
      },
      {
        id: 'p4',
        name: 'Áo thun Premium Motion',
        cat: 'nam-ao',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Đen', 'Trắng', 'Be'],
        price: 389000,
        salePrice: null,
        images: 3,
        imageUrl: '../images/ao-thun-premium-motion.png',
        lineLabel: 'Nam • Cotton Tech',
        newest: 104
      },
      {
        id: 'p5',
        name: 'Blazer Sandstorm',
        cat: 'nu-ao',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Be', 'Đen', 'Xanh'],
        price: 1290000,
        salePrice: null,
        images: 4,
        imageUrl: '../images/blazer-sandstorm.png',
        lineLabel: 'Nữ • Tailoring',
        newest: 105
      },
      {
        id: 'p6',
        name: 'Kids Weekend Set',
        cat: 'tre-be-trai',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Xanh', 'Đỏ', 'Be'],
        price: 459000,
        salePrice: null,
        images: 3,
        imageUrl: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=900&q=80',
        lineLabel: 'Trẻ em • Matching Set',
        newest: 103
      },
      {
        id: 'p7',
        name: 'Nova Runner 4D',
        cat: 'phu-kien-giay',
        sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44'],
        colors: ['Trắng', 'Đen', 'Đỏ'],
        price: 1490000,
        salePrice: null,
        images: 4,
        imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
        lineLabel: 'Phụ kiện • Sneaker',
        newest: 102
      },
      {
        id: 'p8',
        name: 'Eco Denim Jacket',
        cat: 'nam-ao',
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Xanh', 'Trắng', 'Đen'],
        price: 990000,
        salePrice: null,
        images: 3,
        imageUrl: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=80',
        lineLabel: 'Nam • Denim',
        newest: 101
      },
      {
        id: 'p9',
        name: 'Giày Sneaker Cloud Run',
        cat: 'phu-kien-giay',
        sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44'],
        colors: ['Trắng', 'Đen', 'Đỏ'],
        price: 699000,
        salePrice: 559000,
        images: 4,
        imageUrl: '../images/giay-sneaker-cloud-run.png',
        lineLabel: 'SNEAKER',
        newest: 114
      },
      {
        id: 'p10',
        name: 'Quần Tây Slim Tailor',
        cat: 'nam-quan',
        sizes: ['30', '32', '34', '36', '38', '40'],
        colors: ['Be', 'Đen', 'Trắng'],
        price: 899000,
        salePrice: null,
        images: 4,
        imageUrl: '../images/quan-tay-slim-tailor.png',
        lineLabel: 'BOTTOMS',
        badge: 'new',
        newest: 113
      },
      {
        id: 'p11',
        name: 'Túi Da Minimal Tote',
        cat: 'phu-kien-tui',
        sizes: ['One size'],
        colors: ['Be', 'Đen', 'Xanh'],
        price: 749000,
        salePrice: null,
        images: 5,
        imageUrl: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85',
        lineLabel: 'ACCESSORIES',
        badge: 'none',
        newest: 112
      },
      {
        id: 'p12',
        name: 'Đồng Hồ Chrono Brown',
        cat: 'phu-kien-dong-ho',
        sizes: ['Universal'],
        colors: ['Đen', 'Be', 'Trắng'],
        price: 999000,
        salePrice: 649000,
        images: 4,
        imageUrl: '../images/dong-ho-chrono-brown.png',
        lineLabel: 'WATCH',
        badge: 'hot',
        newest: 111
      }
    ];
  }

  function readJson (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function catToFilterCategory (catId) {
    var id = String(catId || '').toLowerCase();
    if (!id) return 'accessories';
    if (id === 'phu-kien' || id.indexOf('phu-kien') === 0) return 'accessories';
    if (id === 'nam' || id.indexOf('nam') === 0) return 'men';
    if (id === 'nu' || id.indexOf('nu') === 0) return 'women';
    if (id === 'tre' || id.indexOf('tre') === 0) return 'kids';
    return 'accessories';
  }

  function colorToFilterToken (c) {
    var k = String(c || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var map = {
      trang: 'white',
      den: 'black',
      be: 'beige',
      kem: 'beige',
      beige: 'beige',
      navy: 'blue',
      xanh: 'blue',
      hong: 'red',
      do: 'red',
      xam: 'black'
    };
    return map[k] || 'beige';
  }

  function uniqueColorOptions (colors) {
    var seen = {};
    return (colors || []).map(function (c) { return String(c || '').trim(); }).filter(Boolean).map(function (name) {
      return { name: name, token: colorToFilterToken(name) };
    }).filter(function (x) {
      if (seen[x.token]) return false;
      seen[x.token] = true;
      return true;
    });
  }

  function resolveLineLabel (p, cats) {
    if (p.lineLabel) return p.lineLabel;
    var c = cats.find(function (x) { return x.id === p.cat; });
    if (!c) return 'Modeva';
    var par = c.parent ? cats.find(function (x) { return x.id === c.parent; }) : null;
    return par ? par.name + ' • ' + c.name : c.name;
  }

  function getDisplayPrice (p) {
    return p.salePrice != null && p.salePrice !== '' ? Number(p.salePrice) : Number(p.price) || 0;
  }

  function ensureProductSeed () {
    var existingRaw = localStorage.getItem(K_PRODUCTS);
    if (!existingRaw) {
      localStorage.setItem(K_PRODUCTS, JSON.stringify(defaultProducts()));
      return;
    }
    // Nếu đang dùng seed cũ (thiếu size/màu theo quy ước), cập nhật lại.
    // Không thay đổi nếu dữ liệu đã có vẻ "đúng schema" hoặc do admin tự thêm.
    try {
      var existing = JSON.parse(existingRaw);
      if (!Array.isArray(existing)) {
        localStorage.setItem(K_PRODUCTS, JSON.stringify(defaultProducts()));
        return;
      }

      function hasAll (arr, required) {
        if (!Array.isArray(arr)) return false;
        return required.every(function (r) { return arr.indexOf(String(r)) !== -1; });
      }

      function colorsAtLeast3 (p) {
        return Array.isArray(p && p.colors) && p.colors.length >= 3;
      }

      var p1 = existing.find(function (x) { return x && x.id === 'p1'; });
      var p2 = existing.find(function (x) { return x && x.id === 'p2'; });
      var p3 = existing.find(function (x) { return x && x.id === 'p3'; });
      var p4 = existing.find(function (x) { return x && x.id === 'p4'; });
      var p5 = existing.find(function (x) { return x && x.id === 'p5'; });
      var p6 = existing.find(function (x) { return x && x.id === 'p6'; });
      var p8 = existing.find(function (x) { return x && x.id === 'p8'; });
      var p7 = existing.find(function (x) { return x && x.id === 'p7'; });
      var p9 = existing.find(function (x) { return x && x.id === 'p9'; });
      var p10 = existing.find(function (x) { return x && x.id === 'p10'; });
      var p11 = existing.find(function (x) { return x && x.id === 'p11'; });
      var p12 = existing.find(function (x) { return x && x.id === 'p12'; });

      var seededIds = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12'];
      var anyBadColors = seededIds.some(function (id) {
        var p = existing.find(function (x) { return x && x.id === id; });
        return p && !colorsAtLeast3(p);
      });

      var needsReseed =
        anyBadColors ||
        (p1 && (!hasAll(p1.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p1))) ||
        (p2 && (!hasAll(p2.sizes, [30, 32, 34, 36, 38, 40]) || !colorsAtLeast3(p2))) ||
        (p3 && (!hasAll(p3.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p3))) ||
        (p4 && (!hasAll(p4.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p4))) ||
        (p5 && (!hasAll(p5.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p5))) ||
        (p6 && (!hasAll(p6.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p6))) ||
        (p8 && (!hasAll(p8.sizes, ['S', 'M', 'L', 'XL']) || !colorsAtLeast3(p8))) ||
        (p7 && (!hasAll(p7.sizes, [36, 37, 38, 39, 40, 41, 42, 43, 44]) || !colorsAtLeast3(p7))) ||
        (p9 && (!hasAll(p9.sizes, [36, 37, 38, 39, 40, 41, 42, 43, 44]) || !colorsAtLeast3(p9))) ||
        (p10 && (!hasAll(p10.sizes, [30, 32, 34, 36, 38, 40]) || !colorsAtLeast3(p10))) ||
        (existing.length < 8);

      if (needsReseed) {
        localStorage.setItem(K_PRODUCTS, JSON.stringify(defaultProducts()));
      }
    } catch (e) {
      localStorage.setItem(K_PRODUCTS, JSON.stringify(defaultProducts()));
    }
  }

  function ensureCategorySeed () {
    if (localStorage.getItem(K_CATEGORIES)) return;
    localStorage.setItem(K_CATEGORIES, JSON.stringify(defaultCategories()));
  }

  /** Bổ sung danh mục / SP mặc định mới (p9…) nếu trình duyệt đã có dữ liệu cũ. */
  function mergeCatalogDefaults () {
    var cats = readJson(K_CATEGORIES, []);
    var catById = {};
    cats.forEach(function (c) { catById[c.id] = true; });
    var catChanged = false;
    defaultCategories().forEach(function (c) {
      if (!catById[c.id]) {
        cats.push(c);
        catById[c.id] = true;
        catChanged = true;
      }
    });
    if (catChanged) localStorage.setItem(K_CATEGORIES, JSON.stringify(cats));

    var products = readJson(K_PRODUCTS, []);
    var byId = {};
    products.forEach(function (p) { byId[p.id] = true; });
    var prodChanged = false;
    defaultProducts().forEach(function (p) {
      if (!byId[p.id]) {
        products.push(p);
        byId[p.id] = true;
        prodChanged = true;
      }
    });
    // Migrate default images from remote URLs to local assets.
    products.forEach(function (p) {
      if (!p) return;
      if (p.id === 'p1') {
        var current1 = String(p.imageUrl || '');
        if (!current1 || current1.indexOf('images.unsplash.com/photo-1596755094514-f87e34085b87') !== -1) {
          p.imageUrl = '../images/ao-so-mi-linen.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p2') {
        var current2 = String(p.imageUrl || '');
        if (!current2 || current2.indexOf('images.unsplash.com/photo-1473966968600-fa8018698690') !== -1) {
          p.imageUrl = '../images/quan-tay-slim.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p4') {
        var current4 = String(p.imageUrl || '');
        if (!current4 || current4.indexOf('images.unsplash.com/photo-1521572267360-ee0c2909d518') !== -1) {
          p.imageUrl = '../images/ao-thun-premium-motion.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p5') {
        var current5 = String(p.imageUrl || '');
        if (!current5 || current5.indexOf('images.unsplash.com/photo-1594938298603-c8148c4dae35') !== -1) {
          p.imageUrl = '../images/blazer-sandstorm.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p9') {
        var current9 = String(p.imageUrl || '');
        if (!current9 || current9.indexOf('images.unsplash.com/photo-1606107557195-0e29a21b7b8d') !== -1) {
          p.imageUrl = '../images/giay-sneaker-cloud-run.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p10') {
        var current10 = String(p.imageUrl || '');
        if (!current10 || current10.indexOf('images.unsplash.com/photo-1506629903123-904e278bed34') !== -1) {
          p.imageUrl = '../images/quan-tay-slim-tailor.png';
          prodChanged = true;
        }
      }
      if (p.id === 'p12') {
        var current12 = String(p.imageUrl || '');
        if (!current12 || current12.indexOf('images.unsplash.com/photo-1524592094714-0ce0658e57ca') !== -1) {
          p.imageUrl = '../images/dong-ho-chrono-brown.png';
          prodChanged = true;
        }
      }
    });
    if (prodChanged) localStorage.setItem(K_PRODUCTS, JSON.stringify(products));
  }

  function hydrateGrid (grid) {
    if (!grid) return;
    ensureProductSeed();
    ensureCategorySeed();
    mergeCatalogDefaults();
    var products = readJson(K_PRODUCTS, []);
    products = products.filter(function (p) { return !(p.deletedAt || p.isDeleted); });
    var cats = readJson(K_CATEGORIES, defaultCategories());
    function tokenToCssBg (token) {
      token = String(token || '').toLowerCase().trim();
      switch (token) {
        case 'white': return '#ffffff';
        case 'black': return '#000000';
        case 'beige': return '#d8c7a0';
        case 'blue': return '#001f3f';
        case 'red': return '#d32f2f';
        default: return '#d8c7a0';
      }
    }
    function catalogBadgeHtml (p) {
      var b = p.badge;
      if (b === 'none') return '';
      if (b === 'new') return '<span class="catalog-card-badge catalog-card-badge--new">NEW</span>';
      if (b === 'hot') return '<span class="catalog-card-badge catalog-card-badge--hot">HOT</span>';
      if (b === 'bestseller') return '<span class="catalog-card-badge catalog-card-badge--bestseller">BEST SELLER</span>';
      if (p.salePrice != null && p.salePrice !== '' && Number(p.salePrice) < Number(p.price)) {
        var pct = Math.round((1 - Number(p.salePrice) / Number(p.price)) * 100);
        return '<span class="catalog-card-badge catalog-card-badge--sale">-' + pct + '%</span>';
      }
      return '';
    }

    var html = products.map(function (p, index) {
      var displayPrice = getDisplayPrice(p);
      var filterCat = p.catalogCategory || catToFilterCategory(p.cat);
      var sizes = (p.sizes || []).map(function (s) { return String(s).trim(); });
      var colorOptions = uniqueColorOptions(p.colors || []);
      var colorTokens = colorOptions.map(function (x) { return x.token; });
      var newest = p.newest != null ? Number(p.newest) : 1000 - index;
      var img = p.imageUrl || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80';
      var line = resolveLineLabel(p, cats);
      var nameAttr = escAttr(p.name);
      var priceStr = formatMoney(displayPrice);
      var firstColor = colorOptions[0] ? colorOptions[0].name : 'Mặc định';
      var firstSize = (p.sizes && p.sizes[0]) ? String(p.sizes[0]) : '—';
      var priceOrigAttr = (p.salePrice != null && p.salePrice !== '' && Number(p.salePrice) < Number(p.price))
        ? String(p.price) : '';
      var salePart = p.salePrice != null && p.salePrice !== '' && Number(p.salePrice) < Number(p.price)
        ? '<span class="catalog-price-old">' + escAttr(formatMoney(p.price)) + '</span> '
        : '';
      var badge = catalogBadgeHtml(p);
      var sizeItemsHtml = (sizes || []).map(function (sz) {
        return '<div class="size-item catalog-size-item" data-size="' + escAttr(sz) + '">' + escAttr(sz) + '</div>';
      }).join('');

      var colorItemsHtml = colorOptions.map(function (col) {
        var bg = tokenToCssBg(col.token);
        return '<div class="color-item catalog-color-item" data-color-name="' + escAttr(col.name) + '" data-color-token="' + escAttr(col.token) + '" style="background:' + escAttr(bg) + ';" title="' + escAttr(col.name) + '"></div>';
      }).join('');
      return (
        '<article class="catalog-product-card" data-product-id="' + escAttr(p.id) + '" data-product-image="' + escAttr(img) + '" data-default-color="' + escAttr(firstColor) + '" data-default-size="' + escAttr(firstSize) + '" data-price-original="' + escAttr(priceOrigAttr) + '" data-name="' + nameAttr + '" data-category="' + escAttr(filterCat) + '" data-price="' + String(displayPrice) + '" data-size="' + escAttr(sizes.join(',').toLowerCase()) + '" data-color="' + escAttr(colorTokens.join(',')) + '" data-newest="' + String(newest) + '">' +
        '<div class="catalog-product-card__visual">' + badge + '<img src="' + escAttr(img) + '" alt="' + nameAttr + '"></div>' +
        '<div><p>' + escAttr(line) + '</p><h3>' + escAttr(p.name) + '</h3><strong>' + salePart + priceStr + '</strong></div>' +
        '<div class="catalog-variants">' +
          '<div class="catalog-variant-label">Chọn size</div>' +
          '<div class="catalog-variant-row">' + sizeItemsHtml + '</div>' +
          '<div class="catalog-variant-label">Chọn màu</div>' +
          '<div class="catalog-variant-row">' + colorItemsHtml + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-dark-modern catalog-add-cart" disabled>Thêm vào giỏ</button>' +
        '</article>'
      );
    }).join('');
    grid.innerHTML = html;
  }

  window.ModevaCatalogSync = {
    KEY_PRODUCTS: K_PRODUCTS,
    KEY_CATEGORIES: K_CATEGORIES,
    ensureProductSeed: ensureProductSeed,
    ensureCategorySeed: ensureCategorySeed,
    mergeCatalogDefaults: mergeCatalogDefaults,
    hydrateGrid: hydrateGrid,
    catToFilterCategory: catToFilterCategory,
    getDisplayPrice: getDisplayPrice,
    defaultProducts: defaultProducts,
    defaultCategories: defaultCategories
  };
})();
