# Requirements

## Core Features

### Storefront
- 高端礼盒品牌首页
- Corporate / Festive 两大 category
- Product listing
- Product detail
- Product variants / price options
- Shopping cart
- Checkout
- Website online payment
- WhatsApp contact button

### Seasonal Content
后台可自行：
- 切换首页主推 category
- 更新 festive campaign
- 更换 hero 图片
- 上下架产品
- 修改产品图片
- 修改 details
- 修改 price
- 管理 variant / upgrade option

### Admin
目标是客户交付后可自行维护，不依赖持续人工代管。

### Payment
需要接入 Payment Gateway。
待确认：
- FPX
- Card
- E-wallet
- 指定 gateway / provider

### Design
- Custom design
- Mobile-first
- 高端礼盒品牌感
- 具体视觉风格待客户给 reference 后确认

---

## Client Original Brief — 2026-09-16

> 这一节用于保留客户最初的需求原文/原始逻辑，后续若需求变化，以最新确认版本为准。

### Brand / Product Positioning
- 我们主要做高端礼盒
- 我们没有固定的 product
- Product 数量通常为每个 category 约 1–4 款

### Original Category Structure

#### 1. Corporate Premium Gift
- 里面有 3 个 standard 方案
- Standard 方案仍然可以 bespoke / 定制

#### 2. Festive Premium Gift Box
包括：
- CNY
- 中秋节
- 端午节
- Hari Raya

### Homepage Logic
- 如果正在跑 festive campaign，Homepage 主推 festive product
- 如果不是 festive season，Homepage 主推 Corporate Gift Box
- Homepage 下方可以选择 / 进入 category

### Festive Pricing Example
示例价格结构：
- Box A — RM188
- Box B — RM288
- Box C — RM388
- Box D — RM588
- RM988 — 基于 Box D 更换酒类
- RM1188 — 基于 Box D 更换酒类
- RM1288 — 基于 Box D 更换酒类
- RM2388 — 基于 Box D 更换酒类

说明：
- RM988 / RM1188 / RM1288 / RM2388 并不是完全独立的新 Box
- 核心逻辑是以 Box D 为基础，通过更换不同酒类形成更高价 variant / upgrade option

### Ordering / Contact
- 网站支持下单
- 保留 WhatsApp contact 入口

### Change Tracking Note
后续客户在 2026-09-22 又提出了新的 Homepage / Category 草图，包括：
- Festive Collection
- Fixed Gift Collection
- Wine & Spirits
- Corporate Orders
- Corporate Orders 下再区分 Semi-Curated / Fully Customised

该新结构与本节“原始需求”存在一定演进关系，设计和开发时应以双方最新确认的 IA / scope 为准，不直接覆盖这份原始记录。
