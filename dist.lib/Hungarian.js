function hungarian(cost) {
  const rowCount = cost.length;
  if (rowCount === 0) return [];
  const columnCount = cost[0].length;
  if (rowCount > columnCount) throw new RangeError("hungarian: rows must be <= columns");
  const rowPotential = new Array(rowCount + 1).fill(0);
  const columnPotential = new Array(columnCount + 1).fill(0);
  const columnOwner = new Array(columnCount + 1).fill(0);
  const previousColumn = new Array(columnCount + 1).fill(0);
  for (let row = 1; row <= rowCount; row++) {
    columnOwner[0] = row;
    let currentColumn = 0;
    const minimum = new Array(columnCount + 1).fill(Infinity);
    const used = new Array(columnCount + 1).fill(false);
    do {
      used[currentColumn] = true;
      const currentRow = columnOwner[currentColumn];
      let delta = Infinity;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column++) {
        if (used[column]) continue;
        const reduced = cost[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column];
        if (reduced < minimum[column]) {
          minimum[column] = reduced;
          previousColumn[column] = currentColumn;
        }
        if (minimum[column] < delta) {
          delta = minimum[column];
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column++) {
        if (used[column]) {
          rowPotential[columnOwner[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (columnOwner[currentColumn] !== 0);
    do {
      const nextColumn = previousColumn[currentColumn];
      columnOwner[currentColumn] = columnOwner[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }
  const assignment = new Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (columnOwner[column] > 0) {
      assignment[columnOwner[column] - 1] = column - 1;
    }
  }
  return assignment;
}
export {
  hungarian
};
