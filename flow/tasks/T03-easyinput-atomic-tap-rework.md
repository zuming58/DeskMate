# T03 rework · EasyInput atomic command taps

- 状态：`TEST_CONFIRMED / BUILD_CONFIRMED / T03_ATOMIC_TAP_PENDING_CLEAN_HEAD_AND_HIL`
- 分支：`codex/easyinput-t03-cold-boot-reconnect`
- 基线失败候选：`cf9fdf877753791393f753e3913f46bfe4f825ce`
- 合同：2026-08-27 修订后的 [`INPUT_V1_FROZEN`](../../contracts/deskmate-host/easyinput-input-v1.md)

## Why this rework exists

连续多轮真实 HIL 已证明：S6 作为 stateful `Ctrl+C` 持续按下时拔 USB，Windows 可能保留已消失 HID lifetime 的 Ctrl。新枚举设备发送一次或多次全零报告、重新建立 TinyUSB DCD、等待 transfer-complete，均不能可靠替旧 lifetime 产生 key-up。该失败在第一次或后续重复中出现，不能继续用重试次数解释。

固定 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的默认 S6 同样是 stateful down/up，因此不能直接证明原测试会通过；Maker 的 synthetic `HidTap` 路径提供可采用的结构：临时按键叠加当前 held snapshot，原子排入 press/restore 对，并精确恢复原 snapshot。

## Allowed implementation

1. S1/S3 继续由现有唯一 `InputActionRouter` 和 held-key state 管理。
2. S2/S4/S5～S8 在稳定 Press 上生成一次 press→restore；Release 只 rearm，重复边沿幂等。
3. press/restore 必须在 16 项现有 USB report queue 中原子准入，不能新增第二套输入状态机、第二个 USB owner 或真实 USB 传输通道。
4. tap 必须叠加并恢复并发的 S1/S3 snapshot；第七 usage、容量不足、发送失败、overflow 和 disconnect 均 fail closed。
5. 保留现有描述符、VID/PID、Report ID、GPIO、队列总容量、滚轮、诊断、Vendor fail-closed、GPIO40 生命周期和冻结分区。

## Required Host evidence

- 八键黄金向量区分 S1/S3 hold 与 S2/S4/S5～S8 tap。
- tap 在实体 Release 之前已经排入 press 和全释放/restore；重复 Press 不重发，Release 不发送 HID，新 Press 才重发。
- S1/S3 与 tap 并发时，第二帧恢复原 held snapshot。
- 只剩一个队列槽时整对拒绝，不出现孤立 modifier down；发送失败后只保留全释放恢复。
- HID 未 ready、延迟 ready、transfer complete/failure、重复 mount、disconnect、overflow 和旧滚轮不重放继续通过。
- 原有描述符完整黄金向量、输入/编码器、生命周期、来源和源码范围测试全部通过。

## Verification and hardware gate

运行 T03 原任务卡的 Host 3/3、精确 ESP-IDF v5.5.5 / esp32s3 build、板级只读扫描及全部静态检查。提交、推送并从干净 HEAD 重建后，先展示 HEAD、app SHA-256 和 app-only 精确范围，再取得针对新镜像的明确写入确认。只允许写 factory app；不得擦除整片或修改 bootloader、分区、NVS、PHY、声音区或 eFuse。

获准烧录并正常重启后，先监控再连续执行五次原断线矩阵。任一次失败立即停止；T03 通过前不开始 T04/T05。
