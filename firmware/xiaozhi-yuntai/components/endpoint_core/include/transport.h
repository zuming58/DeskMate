#pragma once

#include <cstddef>
#include <cstdint>

namespace deskmate::xiaozhi {

class Transport {
public:
    virtual ~Transport() = default;

    virtual bool IsOpen() const noexcept = 0;
    virtual std::size_t Receive(std::uint8_t* destination, std::size_t capacity) = 0;
    virtual std::size_t Send(const std::uint8_t* source, std::size_t size) = 0;
};

}  // namespace deskmate::xiaozhi
