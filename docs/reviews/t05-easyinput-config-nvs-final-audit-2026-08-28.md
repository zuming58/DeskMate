# T05 final independent audit

## Result

T05 的代码门已关闭：固件 Host、ESP-IDF、Windows 原生桥、Electron 主进程和 React 配置页实现了 `CONFIG_V1_FROZEN`，状态可进入 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`。T06 仍保持关闭，必须先完成授权 app-only 烧录、只读配置读取和单字段 NVS 往返验收。

## Closed findings

- 原生桥配置读取由单一窗口线程拥有并同步保护；新请求清理旧分块，断线、旧请求、非法长度、填充、顺序和 epoch 变化均失败关闭。
- `0x13` 的 `0x00/0x01/0x02` 被显式区分；能力响应真实发布 `config_read_v1/config_write_v1`，桌面在读取或写入前先检查能力。
- 固件一次只允许一个配置事务；键盘/滚轮继续优先，配置读写不复制 T03/T04 状态机或灯效所有权。
- NVS 初始化或打开失败不擦除整片、不终止应用，回退到安全默认只读状态；双槽、marker、generation 与 legacy 只读导入保持冻结语义。
- 按键页进入时先读取板上脱敏配置，并以来源和指纹作为编辑基线；只提交用户实际修改的键位和旋钮路径。
- Maker 固定提交仍仅作行为参考；产品实现与来源记录保持在本仓，不复制外部构建产物。

## Evidence

- 固件 Host CTest：6/6。
- 桌面测试：73/73。
- `npm run build:desktop`：通过。
- ESP-IDF：v5.5.5 / esp32s3，固定 16 MB 分区的候选构建通过；最终烧录镜像必须在干净提交后重新构建并记录 HEAD、大小、SHA-256 和 app-only 范围。
- 板级声明扫描：1 PASS、1 `PIN_DECLARATIONS_NOT_FOUND` WARN、0 FAIL；该 WARN 表示扫描器未识别项目的声明形态，不替代已核对的源码、分区和 HIL。

## Remaining hardware gate

当前板运行的是用户临时恢复的 Maker 原始固件。烧录前必须重新验明当前 EasyInput、保存 Git 外恢复备份并核对固定分区；只写本次干净 T05 app。烧录后先正常关机重开，再做只读读取、S7 单字段写入/重启回读/恢复，以及 T03/T04 快速回归。
