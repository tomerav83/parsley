"""A fake resolver for socket.getaddrinfo, the one seam below the SSRF guard."""

import socket
from typing import Any
from unittest import mock

# The fake resolver answers every host with this IP unless a test says otherwise,
# and the pinned transports connect to the IP, so that's the URL respx sees.
PUBLIC_IP = "93.184.216.34"
PINNED = f"https://{PUBLIC_IP}"


def addrinfo(ip: str) -> tuple[Any, ...]:
    """One getaddrinfo entry in the real shape: IPv6 sockaddrs are 4-tuples."""
    if ":" in ip:
        return (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (ip, 0, 0, 0))
    return (socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))


class FakeResolver:
    """Stands in for socket.getaddrinfo, answering from a host → IPs table.

    Unlisted hosts resolve to PUBLIC_IP. A host given several answers returns them
    one per lookup, the last one sticking, which is how a DNS-rebinding name
    behaves. `mock` is the patch itself, for asserting on lookups or swapping in a
    side_effect such as socket.gaierror.
    """

    def __init__(self) -> None:
        self._answers: dict[str, list[list[str]]] = {}
        self.mock: mock.MagicMock

    def answer(self, host: str, *ips: str) -> None:
        self._answers[host] = [list(ips)]

    def rebind(self, host: str, *answers: list[str]) -> None:
        self._answers[host] = list(answers)

    def lookups(self) -> list[str]:
        """Every host looked up so far, in order."""
        return [c.args[0] for c in self.mock.call_args_list]

    def __call__(self, host: str, port: object, *args: Any, **kwargs: Any) -> list[Any]:
        queue = self._answers.get(host, [[PUBLIC_IP]])
        ips = queue.pop(0) if len(queue) > 1 else queue[0]
        return [addrinfo(ip) for ip in ips]
