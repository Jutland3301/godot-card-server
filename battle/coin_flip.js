"use strict";

function chooseFirstPlayer(seats, randomFn = Math.random) {
  const firstSeat = randomFn() < 0.5 ? "A" : "B";
  const firstPlayerId = firstSeat === "A" ? "player1" : "player2";
  const seat = seats && seats[firstSeat] ? seats[firstSeat] : {};

  return {
    first_player_seat: firstSeat,
    first_player_id: firstPlayerId,
    first_player_side: String(seat.side || (firstSeat === "A" ? "human" : "god")).toLowerCase()
  };
}

module.exports = {
  chooseFirstPlayer
};
