using System.Text;

namespace DeskMate.InputBridge;

internal static class VendorReportProtocol
{
    private const byte ReportId = 0x11;
    private const byte FixedTextKind = 0x01;
    private const byte StatusStreamKind = 0x04;
    private const byte ConfigStreamKind = 0x06;
    // The firmware owns a 1536-byte status JSON buffer. Keep the defensive
    // transport ceiling aligned with that contract; 50 payload bytes per
    // report require up to 31 chunks (the effective NUL-terminated JSON is
    // currently at most 1535 bytes).
    internal const int StatusStreamMaxBytes = 1536;
    internal const int StatusStreamMaxChunks = 31;
    internal const int ConfigStreamMaxBytes = 2048;
    internal const int ConfigStreamMaxChunks = 42;

    internal static bool HasValidStreamBounds(byte kind, int total, int declared)
    {
        if (kind == StatusStreamKind)
            return total is >= 1 and <= StatusStreamMaxChunks &&
                   declared is >= 1 and <= StatusStreamMaxBytes;
        if (kind == ConfigStreamKind)
            return total is >= 1 and <= ConfigStreamMaxChunks &&
                   declared is >= 1 and <= ConfigStreamMaxBytes;
        return false;
    }

    public static bool HasValidEnvelope(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != ReportId) return false;
        var kind = report[1];
        var chunk = report[2];
        var total = report[3];
        var length = report[4];
        if (5 + length > report.Length) return false;
        if (report.Slice(5 + length).ContainsAnyExcept((byte)0)) return false;

        if (kind == FixedTextKind)
            return total is >= 1 and <= 17 && chunk < total && length is >= 1 and <= 59;

        if (kind is StatusStreamKind or ConfigStreamKind)
            return total != 0 && chunk < total;

        return chunk == 0 && total == 1;
    }

    public static bool RunSelfTest()
    {
        const string statusJson =
            "{\"schema\":\"ai_keyboard.config_status.v1\",\"capabilities\":{\"config_read_v1\":true,\"config_write_v1\":true}}";
        var statusReports = MakeStatusReports(0x78563412, statusJson);
        var expandedStatusReports = MakeStatusReports(0x12345678, new string('x', 1104));
        var maximumStatusReports = MakeStatusReports(0x10293847, new string('x', 1535));
        var configMiddle = MakeEnvelope(ConfigStreamKind, 3, 5, 59);
        var ackWithStreamShape = MakeEnvelope(0x03, 0, 2, 7);
        var outOfRangeChunk = MakeEnvelope(StatusStreamKind, 2, 2, 20);
        var hostActionWithPadding = MakeEnvelope(0x05, 0, 1, 36);
        hostActionWithPadding[41] = 1;
        var fixedText = new FixedTextAssembler(() => DateTimeOffset.UnixEpoch);
        var first = MakeEnvelope(FixedTextKind, 0, 2, 59);
        Enumerable.Repeat((byte)'a', 59).ToArray().CopyTo(first, 5);
        var last = MakeEnvelope(FixedTextKind, 1, 2, 3);
        Encoding.UTF8.GetBytes("好").CopyTo(last, 5);
        var duplicateFirst = new FixedTextAssembler(() => DateTimeOffset.UnixEpoch);
        var invalidPadding = MakeEnvelope(FixedTextKind, 0, 1, 1);
        invalidPadding[5] = (byte)'x';
        invalidPadding[6] = 1;
        var invalidUtf8 = MakeEnvelope(FixedTextKind, 0, 1, 2);
        invalidUtf8[5] = 0xc3;
        invalidUtf8[6] = 0x28;
        var agentState = MakeAgentStateReport(2, 0x10203040, 600000, 0x78563412);
        var invalidAgentPadding = agentState.ToArray();
        invalidAgentPadding[17] = 1;
        var invalidAgentTtl = MakeAgentStateReport(0, 1, 1, 0);
        var motionRun = PrependReportId(0x18, "444d5251010101010403020102020000d366000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
        var motionAccepted = PrependReportId(0x19, "444d52530101010004030201000000002200000000000000000000000000000000000000000000000100000000000000443322118877665501010202e3fd00");
        var motionTerminal = PrependReportId(0x19, "444d525301020100040302011000000022020014443322110403020100000000000301020200011101000000010000004433221188776655010102029c7d00");
        var motionInvalidPadding = motionRun.ToArray();
        motionInvalidPadding[63] = 1;
        var choreographyV1Run = PrependReportId(0x1a, "444d43510101010004030201020202030301000302010100000000000000000000000000000000000015de0000000000000000000000000000000000000000");
        var choreographyV1Status = PrependReportId(0x1a, "444d43510102000005030201000000000000000000000000000000000000000000000000000000000062260000000000000000000000000000000000000000");
        var choreographyV1Accepted = PrependReportId(0x1b, "444d43530101010004030201000000002400000000000000000000000000000000000000000000000000000044332211887766550102020203031e1f000000");
        var choreographyV1Terminal = PrependReportId(0x1b, "444d43530102010004030201100000002402001844332211040302010000000000030200020001530303000044332211887766550102020203032c17000000");
        var choreographyV1StatusCompleted = PrependReportId(0x1b, "444d435301020200050302011100000025020018443322110403020101000000020202ff02020123030300004433221188776655000000000000451e000000");
        var choreographyV2Run = PrependReportId(0x1a, "444d4351020101000403020102020224125a460100030201010000000000000000000000000000000000000f44000000000000000000000000000000000000");
        var choreographyV2Status = PrependReportId(0x1a, "444d43510202000005030201000000000000000000000000000000000000000000000000000000000000005a8b000000000000000000000000000000000000");
        var choreographyV2StatusCompleted = PrependReportId(0x1b, "444d435302020200050302010900000027020018443322110403020103000000020202ff0202012324125a4644332211887766550000000000000000c80d00");
        var choreographyV1InvalidVersion = choreographyV1Run.ToArray();
        choreographyV1InvalidVersion[5] = 0;
        var choreographyV1InvalidCrc = choreographyV1Run.ToArray();
        choreographyV1InvalidCrc[42] ^= 0x01;
        var choreographyV1InvalidLink = choreographyV1StatusCompleted.ToArray();
        choreographyV1InvalidLink[17] = 0x27;
        WriteChoreographyResponseCrc(choreographyV1InvalidLink, 1);
        var choreographyV1InvalidNumeric = choreographyV1Run.ToArray();
        choreographyV1InvalidNumeric[16] = 4;
        WriteChoreographyRequestCrc(choreographyV1InvalidNumeric, 1);
        var choreographyV1InvalidPadding = choreographyV1Run.ToArray();
        choreographyV1InvalidPadding[44] = 1;
        var choreographyV2InvalidVersion = choreographyV2Run.ToArray();
        choreographyV2InvalidVersion[5] = 3;
        var choreographyV2InvalidCrc = choreographyV2Run.ToArray();
        choreographyV2InvalidCrc[44] ^= 0x01;
        var choreographyV2InvalidLink = choreographyV2StatusCompleted.ToArray();
        choreographyV2InvalidLink[17] = 0x25;
        WriteChoreographyResponseCrc(choreographyV2InvalidLink, 2);
        var choreographyV2InvalidNumeric = choreographyV2Run.ToArray();
        choreographyV2InvalidNumeric[16] = 3;
        WriteChoreographyRequestCrc(choreographyV2InvalidNumeric, 2);
        var choreographyV2InvalidEndpointNumeric = choreographyV2StatusCompleted.ToArray();
        choreographyV2InvalidEndpointNumeric[41] = 3;
        WriteChoreographyResponseCrc(choreographyV2InvalidEndpointNumeric, 2);
        var choreographyV2InvalidPadding = choreographyV2Run.ToArray();
        choreographyV2InvalidPadding[46] = 1;

        return statusReports.Length == 3 &&
               statusReports.All(report => HasValidEnvelope(report)) &&
               expandedStatusReports.Length == 23 &&
               expandedStatusReports.All(report => HasValidEnvelope(report)) &&
               HasValidStreamBounds(StatusStreamKind, expandedStatusReports.Length, 1104) &&
               maximumStatusReports.Length == StatusStreamMaxChunks &&
               maximumStatusReports.All(report => HasValidEnvelope(report)) &&
               HasValidStreamBounds(StatusStreamKind, StatusStreamMaxChunks, StatusStreamMaxBytes) &&
               !HasValidStreamBounds(StatusStreamKind, StatusStreamMaxChunks + 1, 1104) &&
               !HasValidStreamBounds(StatusStreamKind, StatusStreamMaxChunks, StatusStreamMaxBytes + 1) &&
               HasValidStreamBounds(ConfigStreamKind, ConfigStreamMaxChunks, ConfigStreamMaxBytes) &&
               statusReports[0][1] == StatusStreamKind &&
               statusReports[0][2] == 0 &&
               statusReports[0][3] == statusReports.Length &&
               statusReports[0][4] == 59 &&
               statusReports[^1][2] == statusReports.Length - 1 &&
               HasValidEnvelope(configMiddle) &&
               fixedText.Accept(first, out _) &&
               fixedText.Accept(last, out var completed) &&
               completed.Bytes == 62 &&
               completed.Text.EndsWith("好", StringComparison.Ordinal) &&
               !fixedText.Accept(last, out _) &&
               duplicateFirst.Accept(first, out _) &&
               !duplicateFirst.Accept(first, out _) &&
               !duplicateFirst.Accept(last, out _) &&
               !new FixedTextAssembler().Accept(invalidPadding, out _) &&
               !new FixedTextAssembler().Accept(invalidUtf8, out _) &&
               !HasValidEnvelope(hostActionWithPadding) &&
               !HasValidEnvelope(ackWithStreamShape) &&
               !HasValidEnvelope(outOfRangeChunk) &&
               IsValidAgentStateReport(agentState) &&
               !IsValidAgentStateReport(invalidAgentPadding) &&
               !IsValidAgentStateReport(invalidAgentTtl) &&
               IsValidMotionPresetRequest(motionRun) &&
               IsValidMotionPresetResponse(motionAccepted) &&
               IsValidMotionPresetResponse(motionTerminal) &&
               !IsValidMotionPresetRequest(motionInvalidPadding) &&
               IsValidChoreographyRequest(choreographyV1Run) &&
               IsValidChoreographyRequest(choreographyV1Status) &&
               IsValidChoreographyResponse(choreographyV1Accepted) &&
               IsValidChoreographyResponse(choreographyV1Terminal) &&
               IsValidChoreographyResponse(choreographyV1StatusCompleted) &&
               IsValidChoreographyRequest(choreographyV2Run) &&
               IsValidChoreographyRequest(choreographyV2Status) &&
               IsValidChoreographyResponse(choreographyV2StatusCompleted) &&
               !IsValidChoreographyRequest(choreographyV1InvalidVersion) &&
               !IsValidChoreographyRequest(choreographyV1InvalidCrc) &&
               !IsValidChoreographyResponse(choreographyV1InvalidLink) &&
               !IsValidChoreographyRequest(choreographyV1InvalidNumeric) &&
               !IsValidChoreographyRequest(choreographyV1InvalidPadding) &&
               !IsValidChoreographyRequest(choreographyV2InvalidVersion) &&
               !IsValidChoreographyRequest(choreographyV2InvalidCrc) &&
               !IsValidChoreographyResponse(choreographyV2InvalidLink) &&
               !IsValidChoreographyRequest(choreographyV2InvalidNumeric) &&
               !IsValidChoreographyResponse(choreographyV2InvalidEndpointNumeric) &&
               !IsValidChoreographyRequest(choreographyV2InvalidPadding);
    }

    public static bool IsValidAgentStateReport(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x12 || report[1] != 2 ||
            report[2] > 6 || report[3] != 0 || report[4] != 0 ||
            report.Slice(17).ContainsAnyExcept((byte)0)) return false;
        var transitionId = BitConverter.ToUInt32(report.Slice(5, 4));
        var ttlMs = BitConverter.ToUInt32(report.Slice(9, 4));
        if (transitionId == 0) return false;
        return report[2] == 0 ? ttlMs == 0 : ttlMs is >= 1 and <= 600000;
    }

    public static bool IsValidManualCalibrationRequest(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x16 ||
            !report.Slice(1, 4).SequenceEqual("DMCR"u8) || report[5] != 1 ||
            report[6] is < 1 or > 2 || report[8] != 0 ||
            report.Slice(38).ContainsAnyExcept((byte)0) ||
            BitConverter.ToUInt16(report.Slice(36, 2)) != Crc16Ccitt(report.Slice(1, 35)) ||
            BitConverter.ToUInt32(report.Slice(9, 4)) == 0) return false;
        var kind = report[6];
        var confirmation = BitConverter.ToUInt32(report.Slice(13, 4));
        if (kind == 2)
            return report[7] == 0 && confirmation == 0 && !report.Slice(17, 19).ContainsAnyExcept((byte)0);
        if (report[7] != 0x01 || confirmation == 0) return false;
        return IsValidManualCalibrationCommand(report.Slice(17, 19));
    }

    public static bool IsValidManualCalibrationResponse(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x17 ||
            !report.Slice(1, 4).SequenceEqual("DMCS"u8) || report[5] != 1 ||
            report[6] is < 1 or > 2 || report[7] is < 1 or > 2 || report[8] > 11 ||
            BitConverter.ToUInt32(report.Slice(9, 4)) == 0 || report[22] is not (0 or 0x02 or 0x04) ||
            report[24] > 19 || report.Slice(62).ContainsAnyExcept((byte)0) ||
            BitConverter.ToUInt16(report.Slice(60, 2)) != Crc16Ccitt(report.Slice(1, 59))) return false;
        var length = report[24];
        if (report.Slice(25 + length, 19 - length).ContainsAnyExcept((byte)0)) return false;
        var expectedMessage = report[7] == 1 ? 0x20 : 0x21;
        if (report[21] != expectedMessage) return false;
        if (report[6] == 1)
            return report[8] == 0 && report[22] == 0 && length == 0;
        if (report[8] == 0)
            return report[22] == 0x02 && length == (report[7] == 1 ? 19 : 18) && IsValidManualCalibrationEndpoint(report.Slice(25, length), report[21]);
        return length == 0;
    }

    public static bool IsValidMotionPresetRequest(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x18 ||
            !report.Slice(1, 4).SequenceEqual("DMRQ"u8) || report[5] != 1 ||
            report[6] is < 1 or > 2 || BitConverter.ToUInt32(report.Slice(9, 4)) == 0 ||
            report[15] != 0 || report[16] != 0 || report.Slice(19).ContainsAnyExcept((byte)0) ||
            BitConverter.ToUInt16(report.Slice(17, 2)) != Crc16Ccitt(report.Slice(1, 16))) return false;
        var kind = report[6];
        var source = report[7];
        var operation = report[8];
        var preset = report[13];
        var repeat = report[14];
        if (kind == 2) return source == 0 && operation == 0 && preset == 0 && repeat == 0;
        return IsValidMotionCommandFields(source, operation, preset, repeat);
    }

    public static bool IsValidMotionPresetResponse(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x19 ||
            !report.Slice(1, 4).SequenceEqual("DMRS"u8) || report[5] != 1 ||
            report[6] is < 1 or > 2 || report[7] is < 1 or > 2 || report[8] > 11 ||
            BitConverter.ToUInt32(report.Slice(9, 4)) == 0 ||
            report[17] != (report[7] == 1 ? 0x22 : 0x23) ||
            report[18] is not (0 or 0x02 or 0x04) || report[19] > 6 ||
            report[20] is not (0 or 20) || report[63] != 0 ||
            BitConverter.ToUInt16(report.Slice(61, 2)) != Crc16Ccitt(report.Slice(1, 60))) return false;
        var length = report[20];
        if (report.Slice(21 + length, 20 - length).ContainsAnyExcept((byte)0)) return false;
        if (report[7] == 2)
        {
            if (report[57] != 0 || report[58] != 0 || report[59] != 0 || report[60] != 0) return false;
        }
        else if (!IsValidMotionCommandFields(report[57], report[58], report[59], report[60])) return false;
        if (report[6] == 1) return report[8] == 0 && report[18] == 0 && report[19] == 0 && length == 0;
        if (report[8] == 0) return report[18] == 0x02 && report[19] == 0 && length == 20 && IsValidMotionEndpoint(report.Slice(21, 20));
        if (report[8] == 8) return report[18] == 0x04 && report[19] is >= 1 and <= 6 && length == 0;
        return report[18] == 0 && report[19] == 0 && length == 0;
    }

    public static bool IsValidChoreographyRequest(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x1a ||
            !report.Slice(1, 4).SequenceEqual("DMCQ"u8) || report[5] is < 1 or > 2 ||
            report[6] is < 1 or > 2 || report[8] != 0 ||
            BitConverter.ToUInt32(report.Slice(9, 4)) == 0) return false;
        var version = report[5];
        var crcOffset = version == 2 ? 44 : 42;
        if (report.Slice(crcOffset + 2).ContainsAnyExcept((byte)0) ||
            BitConverter.ToUInt16(report.Slice(crcOffset, 2)) !=
                Crc16Ccitt(report.Slice(1, crcOffset - 1))) return false;
        if (report[6] == 2)
            return report[7] == 0 && !report.Slice(13, crcOffset - 13).ContainsAnyExcept((byte)0);
        if (report[7] is < 1 or > 4 || report[13] is < 2 or > 8 ||
            report[14] is < 1 or > 4 || report[15] is < 1 or > 3) return false;
        var beatOffset = 18;
        if (version == 1)
        {
            if (report[16] is < 1 or > 3 || report[17] is < 1 or > 3) return false;
        }
        else
        {
            if (report[16] is < 4 or > 40 || report[17] is < 4 or > 20 ||
                report[18] is < 20 or > 100 || report[19] is < 20 or > 100) return false;
            beatOffset = 20;
        }
        var changed = false;
        for (var index = 0; index < 8; index++)
        {
            var offset = beatOffset + index * 3;
            if (index < report[13])
            {
                if (report[offset] > 3 || report[offset + 1] > 3 || report[offset + 2] > 3) return false;
                changed |= report[offset] != 0 || report[offset + 1] != 0 || report[offset + 2] != 0;
            }
            else if (report.Slice(offset, 3).ContainsAnyExcept((byte)0)) return false;
        }
        return changed;
    }

    public static bool IsValidChoreographyResponse(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x1b ||
            !report.Slice(1, 4).SequenceEqual("DMCS"u8) || report[5] is < 1 or > 2 ||
            report[6] is < 1 or > 2 || report[7] is < 1 or > 2 ||
            report[8] > 11 || BitConverter.ToUInt32(report.Slice(9, 4)) == 0 ||
            report[18] is not (0 or 0x02 or 0x04) || report[19] > 6 ||
            report[20] is not (0 or 24)) return false;
        var version = report[5];
        var expectedMessage = version == 2
            ? (report[7] == 1 ? 0x26 : 0x27)
            : (report[7] == 1 ? 0x24 : 0x25);
        var crcOffset = version == 2 ? 61 : 59;
        if (report[17] != expectedMessage ||
            report.Slice(crcOffset + 2).ContainsAnyExcept((byte)0) ||
            BitConverter.ToUInt16(report.Slice(crcOffset, 2)) !=
                Crc16Ccitt(report.Slice(1, crcOffset - 1))) return false;
        var length = report[20];
        if (report.Slice(21 + length, 24 - length).ContainsAnyExcept((byte)0)) return false;
        if (report[7] == 2)
        {
            if (report.Slice(53, crcOffset - 53).ContainsAnyExcept((byte)0)) return false;
        }
        else
        {
            if (report[53] is < 1 or > 4 || report[54] is < 2 or > 8 ||
                report[55] is < 1 or > 4 || report[56] is < 1 or > 3) return false;
            if (version == 1)
            {
                if (report[57] is < 1 or > 3 || report[58] is < 1 or > 3) return false;
            }
            else if (report[57] is < 4 or > 40 || report[58] is < 4 or > 20 ||
                     report[59] is < 20 or > 100 || report[60] is < 20 or > 100) return false;
        }
        if (report[6] == 1) return report[8] == 0 && report[18] == 0 && report[19] == 0 && length == 0;
        if (report[8] == 0) return report[18] == 0x02 && report[19] == 0 && length == 24 && IsValidChoreographyEndpoint(report.Slice(21, 24), version);
        if (report[8] == 8) return report[18] == 0x04 && report[19] is >= 1 and <= 6 && length == 0;
        return report[18] == 0 && report[19] == 0 && length == 0;
    }

    private static bool IsValidChoreographyEndpoint(ReadOnlySpan<byte> payload, byte version)
    {
        if (payload.Length != 24 || BitConverter.ToUInt32(payload.Slice(0, 4)) == 0 ||
            payload[12] > 14 || payload[13] > 5 || payload[14] > 8 ||
            (payload[15] != 0xff && payload[15] > 7) || payload[16] > 3 ||
            payload[17] > payload[16] || payload[18] > 4) return false;
        if (version == 1)
        {
            if (payload[20] is < 1 or > 3 || payload[21] is < 1 or > 3 ||
                payload[22] != 0 || payload[23] != 0) return false;
        }
        else if (payload[20] is < 4 or > 40 || payload[21] is < 4 or > 20 ||
                 payload[22] is < 20 or > 100 || payload[23] is < 20 or > 100) return false;
        return ((payload[19] & 0x80) != 0) == (payload[12] == 1);
    }

    private static void WriteChoreographyRequestCrc(Span<byte> report, byte version)
    {
        var crcOffset = version == 2 ? 44 : 42;
        BitConverter.TryWriteBytes(report.Slice(crcOffset, 2), Crc16Ccitt(report.Slice(1, crcOffset - 1)));
    }

    private static void WriteChoreographyResponseCrc(Span<byte> report, byte version)
    {
        var crcOffset = version == 2 ? 61 : 59;
        BitConverter.TryWriteBytes(report.Slice(crcOffset, 2), Crc16Ccitt(report.Slice(1, crcOffset - 1)));
    }

    private static bool IsValidMotionCommandFields(byte source, byte operation, byte preset, byte repeat)
    {
        if (operation == 1) return source is >= 1 and <= 4 && preset is >= 1 and <= 4 && repeat is >= 1 and <= 3;
        if (operation is 2 or 3) return source is 1 or 2 && preset == 0 && repeat == 0;
        if (operation == 4) return source == 1 && preset == 0 && repeat == 0;
        return false;
    }

    private static bool IsValidMotionEndpoint(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != 20 || BitConverter.ToUInt32(payload.Slice(0, 4)) == 0 || payload[12] > 14 || payload[13] > 5 || payload[14] > 4 || payload[15] > 4 || payload[16] > 3 || payload[17] > 3 || payload[18] > 4 || (payload[19] & 0x80) != 0 || payload[17] > payload[16]) return false;
        var action = BitConverter.ToUInt32(payload.Slice(4, 4));
        var operation = payload[14];
        var preset = payload[15];
        var repeat = payload[16];
        var completed = payload[17];
        var source = payload[18];
        var flags = payload[19];
        if (operation == 0)
        {
            if (action != 0 || preset != 0 || repeat != 0 || completed != 0 || source != 0) return false;
        }
        else if (action == 0 || !IsValidMotionCommandFields(source, operation, preset, repeat)) return false;
        if (((flags & 0x40) != 0) != (payload[12] == 1)) return false;
        if (operation == 1 && payload[12] == 2 && (payload[13] != 2 || completed != repeat || (flags & 0x20) == 0)) return false;
        if (operation is 2 or 4 && payload[12] == 2 && (payload[13] != 2 || (flags & 0x02) == 0 || (flags & 0x20) == 0)) return false;
        if (operation == 3 && payload[12] == 10 && (payload[13] != 4 || (flags & 0x04) == 0 || (flags & 0x20) == 0)) return false;
        return true;
    }

    private static bool IsValidManualCalibrationCommand(ReadOnlySpan<byte> payload)
    {
        var session = BitConverter.ToUInt32(payload.Slice(0, 4));
        var action = BitConverter.ToUInt32(payload.Slice(4, 4));
        var token = BitConverter.ToUInt32(payload.Slice(8, 4));
        var operation = payload[12]; var axis = payload[13]; var direction = unchecked((sbyte)payload[14]);
        var lease = BitConverter.ToUInt16(payload.Slice(16, 2)); var safety = payload[18];
        if (session == 0 || action == 0 || operation > 6 || payload[15] != 0) return false;
        if (operation == 0) return axis <= 1 && token != 0 && direction == 0 && lease is >= 1000 and <= 5000 && safety == 0x0f;
        if (operation == 1) return axis <= 1 && token == 0 && direction == 0 && lease == 0 && safety == 0;
        if (operation is 2 or 3 or 4) return axis <= 1 && token != 0 && (operation == 3 ? direction is -1 or 1 : direction == 0) && lease == 0 && safety == 0;
        return axis == 0xff && token == 0 && direction == 0 && lease == 0 && safety == 0;
    }

    private static bool IsValidManualCalibrationEndpoint(ReadOnlySpan<byte> payload, byte messageType)
    {
        if (messageType == 0x21)
            return payload.Length == 18 && payload[12] <= 5 && payload[13] is 0 or 1 or 0xff && (payload[14] & 0xc0) == 0 && payload[16] == 10 && payload[17] == 0;
        return payload.Length == 19 && payload[12] <= 16 && payload[13] <= 5 && payload[14] is 0 or 1 or 0xff && (payload[15] & 0xc0) == 0 && payload[17] == 10 && payload[18] == 0;
    }

    private static byte[][] MakeStatusReports(uint requestId, string json)
    {
        var data = System.Text.Encoding.UTF8.GetBytes(json);
        const int bytesPerChunk = 50;
        var total = (data.Length + bytesPerChunk - 1) / bytesPerChunk;
        var crc = Crc16Ccitt(data);
        var reports = new byte[total][];
        for (var chunk = 0; chunk < total; chunk++)
        {
            var offset = chunk * bytesPerChunk;
            var count = Math.Min(bytesPerChunk, data.Length - offset);
            var report = MakeEnvelope(StatusStreamKind, (byte)chunk, (byte)total, (byte)(9 + count));
            report[5] = 1;
            BitConverter.TryWriteBytes(report.AsSpan(6, 4), requestId);
            BitConverter.TryWriteBytes(report.AsSpan(10, 2), (ushort)data.Length);
            BitConverter.TryWriteBytes(report.AsSpan(12, 2), crc);
            data.AsSpan(offset, count).CopyTo(report.AsSpan(14));
            reports[chunk] = report;
        }
        return reports;
    }

    private static ushort Crc16Ccitt(ReadOnlySpan<byte> data)
    {
        var crc = 0xffff;
        foreach (var value in data)
        {
            crc ^= value << 8;
            for (var bit = 0; bit < 8; bit++)
                crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
        return (ushort)crc;
    }

    private static byte[] MakeEnvelope(byte kind, byte chunk, byte total, byte length)
    {
        var report = new byte[64];
        report[0] = ReportId;
        report[1] = kind;
        report[2] = chunk;
        report[3] = total;
        report[4] = length;
        return report;
    }

    private static byte[] MakeAgentStateReport(byte state, uint transitionId, uint ttlMs, uint sourceHash)
    {
        var report = new byte[64];
        report[0] = 0x12;
        report[1] = 2;
        report[2] = state;
        BitConverter.TryWriteBytes(report.AsSpan(5, 4), transitionId);
        BitConverter.TryWriteBytes(report.AsSpan(9, 4), ttlMs);
        BitConverter.TryWriteBytes(report.AsSpan(13, 4), sourceHash);
        return report;
    }

    private static byte[] PrependReportId(byte reportId, string payloadHex)
    {
        var payload = Convert.FromHexString(payloadHex);
        if (payload.Length != 63) throw new InvalidOperationException("invalid-motion-golden-vector");
        var report = new byte[64];
        report[0] = reportId;
        payload.CopyTo(report, 1);
        return report;
    }
}

internal sealed record FixedTextPayload(string Text, int Bytes);

internal sealed class FixedTextAssembler
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private readonly Func<DateTimeOffset> _now;
    private readonly List<byte> _bytes = new(960);
    private byte _total;
    private byte _next;
    private DateTimeOffset _lastProgress;
    private byte[]? _completedReport;
    private DateTimeOffset _completedAt;

    public FixedTextAssembler(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

    public bool Accept(ReadOnlySpan<byte> report, out FixedTextPayload payload)
    {
        payload = new FixedTextPayload(string.Empty, 0);
        var now = _now();
        if (report.Length != 64 || report[0] != 0x11 || report[1] != 0x01 || !VendorReportProtocol.HasValidEnvelope(report))
        {
            ResetActive();
            return false;
        }
        if (_next != 0 && now - _lastProgress > TimeSpan.FromSeconds(3)) ResetActive();
        var chunk = report[2];
        var total = report[3];
        var length = report[4];
        if (report.Slice(5 + length).ContainsAnyExcept((byte)0))
        {
            ResetActive();
            return false;
        }
        if (_completedReport is not null && now - _completedAt <= TimeSpan.FromMilliseconds(250) && report.SequenceEqual(_completedReport))
        {
            return false;
        }
        if (chunk == 0)
        {
            if (_next != 0)
            {
                ResetActive();
                return false;
            }
            ResetActive();
            _total = total;
        }
        if ((_next == 0 && chunk != 0) || total != _total || chunk != _next ||
            (chunk + 1 < total && length != 59) || _bytes.Count + length > 960)
        {
            ResetActive();
            return false;
        }
        _bytes.AddRange(report.Slice(5, length).ToArray());
        _next++;
        _lastProgress = now;
        if (_next != _total) return true;
        try
        {
            var data = _bytes.ToArray();
            var text = StrictUtf8.GetString(data);
            if (text.Length == 0 || text.Any(character => character == '\0' ||
                (character < ' ' && character is not '\t' and not '\r' and not '\n')))
                throw new DecoderFallbackException();
            payload = new FixedTextPayload(text, data.Length);
            _completedReport = report.ToArray();
            _completedAt = now;
            ResetActive();
            return true;
        }
        catch (DecoderFallbackException)
        {
            ResetActive();
            return false;
        }
    }

    public void Reset()
    {
        ResetActive();
        _completedReport = null;
    }

    private void ResetActive()
    {
        _bytes.Clear();
        _total = 0;
        _next = 0;
        _lastProgress = default;
    }
}
