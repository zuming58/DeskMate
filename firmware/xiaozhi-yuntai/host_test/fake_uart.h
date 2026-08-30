#pragma once

#include "transport.h"

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

namespace deskmate::xiaozhi::test {

class FakeUartTransport final : public Transport {
public:
    bool IsOpen() const noexcept override;
    TransportReadResult Receive(std::uint8_t* destination,
                                std::size_t capacity) override;
    std::size_t Send(const std::uint8_t* source, std::size_t size) override;

    void SetOpen(bool open) noexcept;
    void FeedReceive(const std::vector<std::uint8_t>& bytes);
    void SignalOverflow() noexcept;
    void SignalError() noexcept;
    void SetSendLimit(std::size_t limit) noexcept;
    std::vector<std::uint8_t> TakeSent();

private:
    bool open_ = false;
    bool overflow_ = false;
    bool error_ = false;
    std::size_t send_limit_ = static_cast<std::size_t>(-1);
    std::deque<std::uint8_t> received_;
    std::vector<std::uint8_t> sent_;
};

}  // namespace deskmate::xiaozhi::test
