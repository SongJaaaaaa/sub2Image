const FILTER_NAMES: Record<string, string> = {
  Original: '原图',
  Invert: '反色',
  'Black & White': '黑白',
  Sepia: '复古棕',
  Solarize: '曝光反转',
  Clarendon: '鲜明',
  Gingham: '柔和',
  Moon: '月光',
  Lark: '云雀',
  Reyes: '柔雾',
  Juno: '暖调',
  Slumber: '暖灰',
  Crema: '奶油',
  Ludwig: '路德维希',
  Aden: '亚丁',
  Perpetua: '佩佩图阿',
  Amaro: '阿马罗',
  Mayfair: '梅费尔',
  Rise: '日升',
  Hudson: '哈德逊',
  Valencia: '瓦伦西亚',
  'X-Pro II': '交叉冲印二',
  Sierra: '塞拉',
  Willow: '柳木',
  'Lo-Fi': '高反差',
  Inkwell: '墨水',
  Hefe: '赫菲',
  Nashville: '纳什维尔',
  Stinson: '斯廷森',
  Vesper: '暮色',
  Earlybird: '晨光',
  Brannan: '布兰南',
  Sutro: '苏特罗',
  Toaster: '暖烘',
  Walden: '瓦尔登',
  Kelvin: '开尔文',
  Maven: '梅文',
  Ginza: '银座',
  Skyline: '天际线',
  Dogpatch: '乡野',
  Brooklyn: '布鲁克林',
  Helena: '海伦娜',
  Ashby: '阿什比',
  Charmes: '魅力',
}

export function localizeFilerobotFilters(root: HTMLElement) {
  const update = () => {
    root.querySelectorAll<HTMLElement>('.FIE_filters-item-label').forEach((el) => {
      const name = el.textContent?.trim()
      if (name && FILTER_NAMES[name]) el.textContent = FILTER_NAMES[name]
    })
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { childList: true, subtree: true })
  update()
  return () => observer.disconnect()
}
