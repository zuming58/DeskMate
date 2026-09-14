# 陪伴低延迟：提前生成与说完判断调研

日期：2026-09-11。状态：`RESEARCH_ONLY / NOT_FROZEN`。

用户提出：停顿约半秒后可先让模型准备，若继续说话，再处理补充内容；要求参考成熟案例。本文只做官方资料、固定源码与测试的对照，不安装框架/模型、不调整音频、不实现推测回复。当前代码基线为 `644d366`。

## 结论

这个方向可行，重点是把“准备回答”和“允许出声”分开，而不是把每次停顿都当成说完。大模型计算可以与说完判断重叠；计算耗时本身不能充当可靠的说完判断，因为快慢不固定。

当前 OpenAI-compatible HTTP 请求体在发出时固定。后续补充不能直接塞进同一个正在生成的请求；需要合并本轮文本、取消失效候选并重新生成。若候选仍与最终文本及上下文一致，则复用已经计算的结果。

只缩短 `endSmoothWindowMs` 不足以实现这件事。它可能将一个长句切成多段，而现有 DeskMate 会将每段 final 当成独立正式用户轮次。实施前必须冻结候选生成、片段合并、最终提交和取消边界。

## 官方案例与固定参考

### LiveKit Agents：提前生成与播放调度分离

[官方参数说明](https://docs.livekit.io/reference/agents/turn-handling-options/)支持在确认用户轮次结束前运行 LLM；TTS 可以等确认后启动，也可以选择提前合成。候选次数和时长有上限。[调优说明](https://docs.livekit.io/agents/logic/turns/tuning/)将端点检测、打断和提前生成作为不同阶段。

本次只读固定到 `livekit/agents-js@79e2bf537de98f5aadc6d40fbcbb97baa09482f5`：

- [agent_activity.ts](https://github.com/livekit/agents-js/blob/79e2bf537de98f5aadc6d40fbcbb97baa09482f5/agents/src/voice/agent_activity.ts)：检查了 `onPreemptiveGeneration`、最终文本/上下文一致性判断、`cancelPreemptiveGeneration` 与合成/调度门。候选使用复制的上下文，暂不安排播放；最终一致才调度，不一致则取消。
- [候选暂停死锁回归](https://github.com/livekit/agents-js/blob/79e2bf537de98f5aadc6d40fbcbb97baa09482f5/agents/src/voice/agent_activity_preemptive_pause_deadlock.test.ts)：检查了三个用例，覆盖未调度候选在暂停/交接期间的清理。
- [语音状态所有权回归](https://github.com/livekit/agents-js/blob/79e2bf537de98f5aadc6d40fbcbb97baa09482f5/agents/src/voice/agent_activity_speech_ownership.test.ts)：检查了旧清理不能覆盖新语音状态的用例。

只审阅，未运行上游测试。并非引入 LiveKit SDK 或复制其实现；若未来派生代码，须另行记录 Apache-2.0 归属与目标文件。上游也有[旧候选取消后仍播放的用户报告](https://github.com/livekit/agents-js/issues/2059)，不能把采用框架等同于不会重播/死锁，也不据单个报告认定所有版本都有该问题。

### Pipecat Smart Turn：判断停顿是否代表说完

[官方说明](https://docs.pipecat.ai/api-reference/server/utilities/turn-detection/smart-turn-overview)将语音活动检测与轮次结束判断分开，短静音触发对当前语音片段的分析，并保留长静音兜底。它不是另一个回答用户的大模型。

本次固定 `pipecat-ai/smart-turn@4786657e242dfe77dd138699ac564ee074a2a543`，审阅 [README](https://github.com/pipecat-ai/smart-turn/blob/4786657e242dfe77dd138699ac564ee074a2a543/README.md) 与 [inference.py](https://github.com/pipecat-ai/smart-turn/blob/4786657e242dfe77dd138699ac564ee074a2a543/inference.py)。README 标为 v3.2，包含中文支持；模型基于音频而非仅转录文字，支持本地 ONNX 推理。输入为 16 kHz 单声道、有界最近音频窗口，输出说完/未说完判断。

这里只把它列为中文轮次检测候选，没有下载权重或测本机性能；上游耗时/准确率不能当成 DeskMate 的真机结果。未来引入需固定权重哈希、核对代码/权重许可、包体和 CPU 开销，并验证中文犹豫、公放回声与不同麦克风。不能只因为某句包含“然后”就宣称完成语义断句。

### Qwen：已有稳定片段，但 final 不等于人的完整轮次

[官方服务端事件](https://help.aliyun.com/en/model-studio/qwen-asr-realtime-server-events)区分已确认 `text`、可修订 `stash` 与最终 completed。[客户端事件](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events)提供 server VAD 静音时长设置。

DeskMate 的 `streaming-asr-adapter.cjs` 已保留 `confirmedText` 与当前片段标识，可复用同一 ASR，不需要第二次识别或再交给豆包回答。但如果稳定文本/结束事件仍等到原静音门限才到，单纯在 final 后加“提前生成”没有提前收益。

## 与 DeskMate 的行为差异

| 位置 | 当前实现 | 后续最小改动方向 |
| --- | --- | --- |
| ASR partial | 只显示和辅助已确认打断 | 允许经过门控的稳定文本参与候选；stash 不当事实 |
| ASR final | 立即提交用户轮次并启动模型 | 区分识别片段结束与完整用户轮次；等待期间补充合并 |
| 模型生成 | 直接更新主上下文；稳定分句立即交 TTS | 候选在隔离快照计算；确认一致后才提交/释放 |
| 用户续说 | 有合格证据时取消在途回复 | 出声前也要抑制候选播放，合并后重算而非漏掉前半句 |
| 候选撤销 | 尚无候选提交语义 | 取消、迟到事件、音频与上下文都有独立代次门禁 |
| 工具/记忆 | final 后可进入确定性动作和持久化 | 候选不得执行动作、写入记忆、访问远端或产生确认事实 |
| 观测 | 最后一轮覆盖前一轮；错误原因合并 | 有界逐轮耗时、失败阶段、候选复用/取消统计 |

当前代码路径：`three-stage-companion-provider.cjs` 的 `handleAsrEvent/runModelTurn/queueSpeech`，`companion-model-adapter.cjs` 的 `messages/streamTurn`，`companion-conversation.cjs` 的 `commitFinalTurn/handleProviderEvent`。现有 T21 明确禁止 partial 调模型；这次调研不暗改该冻结规则。

## 建议的实现顺序（待冻结）

1. **先修可靠性和计时。** 保留每轮 ASR、模型首字、首句、首音频、播放开始以及失败耗时，安全分类网络/HTTP/超时错误。可恢复的模型错误不应等同于整个音频会话故障；有界恢复失败仍须明确反馈，不能无限重试。
2. **再拆开生成与播放。** 先建立隔离候选、用户片段聚合和唯一提交点。保持一个 VoiceWorkflow、一个 CompanionModel，沿用当前麦克风、上下文与豆包音色。
3. **测试提早启动的两条路线。** 一是将 ASR 片段端点试设约 500–700 ms，final 只提供候选片段，应用独立确认完整轮次；二是稳定识别片段加本地可信停顿信号，早于现有 final 准备。前者必须先有片段聚合；后者不能把“没收到新 partial”误当“用户没声音”。500–700 ms 是实验起点，不是已生效设置或首声保证。
4. **说完确认与生成并行。** 中文完整短句尽早放行，犹豫/未完整表达延后；Smart Turn 为可评估候选，未通过前保留保守后备。第一版可只提前 LLM，确认后 TTS；如 TTS 仍显著拖慢，再测试有界首句预合成，禁止提前实际播放。
5. **你继续说时让出。** 可信新语音先拦住尚未播放的候选，得到修订文本后取消旧请求并合并重算；单个噪声不能触发已播语音的破坏性清空。出声前再次验证代次、文本/上下文版本、是否仍在说话。误检测后只能恢复仍有效且未播放的候选，不能重播已听过的回答。

建议每轮最多一个活跃候选、最多两次重新计算；连续修订或长句退回确认后生成，控制浪费的模型费用。最终正文/经确认的完整用户文本才进入记忆；历史检索仍按 T27 本地优先，远端只在确认后按需调用。

## 预期与验收

现状中断句等待和模型启动基本串行。新方案是在等待是否续说时先计算，并在确认后复用，能隐藏一部分等待，但不能保证半秒出声，也不能消除云端模型与网络本身耗时。第一次回答、长历史、远端查资料与普通闲聊要分别统计，不能混用短句演示成绩。

必须覆盖：半秒停顿后续说；“我想……算了换一个”；否定词/数字临时改口；模型极快返回时用户仍说话；拍手/公放回声；迟到取消；模型失败；键盘/唤醒抢占；候选已合成但未播放；用户按停止；连续长句。不允许草稿播报、重复回答、漏前半句、生成不存在的记忆或触发动作。

性能口径采用本地音频时间轴上的最后有效语音到实际播放开始；如只能测队列提交，明确降级标签。记录 P50/P95、误截断率、续说丢失率、候选复用/取消率与额外请求数。将自然短句一到两秒出声作为待验证目标，不作本轮交付承诺。
