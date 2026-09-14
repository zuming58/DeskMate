# T43 Style Studio physical encoder press

## Outcome

风格映像页面现在拥有旋钮按压的临时语义：页面前台且易失租约有效时，按下实体旋钮等于当前 Studio 的“确认”。在生成态直接进入生图/确认流程；S1 强度态确认数值；显影态确认当前效果并进入圆窗或颗粒参数。它不再在这个页面切换纵向/横向滚动。

作品区中的预制样片和历史生成作品共用同一条再编辑链：第一次点击作品卡片放大，第二次点击放大图、再次按 S2，或点击“进入显影”都会进入同一个显影编辑状态。显影保存导出新画面，不覆盖本地作品原件。

## Ownership boundary

- React 只申请/释放页面输入所有权并消费语义命令，不读取 HID、设备路径或密钥。
- Electron 主进程持有随机非零 token，通过原生桥发送冻结 Feature report `0x1C`，每秒续租一次，TTL 为 2500 ms。
- Windows 原生桥只在设备显式声明 `style_studio_input_lease_v1` 且 FF00:0009 集合精确匹配时写入；确认只返回脱敏 ACK。
- EasyInput 固件把租约保存在 RAM，并绑定当前 USB mount epoch。租约有效期间，GPIO18 的完整 press/release 都归专用 Host Action owner，不触碰持久化 `scroll_axis_toggle`。
- 页面离开、失焦、刷新、renderer 崩溃、应用退出会释放；USB 重连或 TTL 到期也会自动清除。普通页面继续使用原来的纵横切换。

## Visible truth

工具栏只显示三种事实：正在连接、旋钮按压已接管、需要新版固件。旧固件缺少能力位时不尝试猜测性写入，也不宣称实体按压可用。

## Verification boundary

Host 单测、Windows 原生桥协议自检和 ESP-IDF 构建证明协议与代码链可构建；它们不证明已写入当前设备。新的实体行为只有在用户另行明确授权 app-only 固件写入，并完成“本页按压确认、离页按压切换纵横、失焦/拔线恢复”真机矩阵后才可标记为 HIL 通过。
