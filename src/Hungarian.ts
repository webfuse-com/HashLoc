// Minimum-cost assignment (Hungarian algorithm, O(n²·m)) for an n×m cost matrix with n <= m.
// Returns the assigned column for each row.
export function hungarian(cost: number[][]): number[] {
	const rowCount: number = cost.length;

	if(rowCount === 0) return [];

	const columnCount: number = cost[0].length;

	if(rowCount > columnCount) throw new RangeError("hungarian: rows must be <= columns");

	const rowPotential: number[] = new Array<number>(rowCount + 1).fill(0);
	const columnPotential: number[] = new Array<number>(columnCount + 1).fill(0);
	const columnOwner: number[] = new Array<number>(columnCount + 1).fill(0);
	const previousColumn: number[] = new Array<number>(columnCount + 1).fill(0);

	for(let row: number = 1; row <= rowCount; row++) {
		columnOwner[0] = row;

		let currentColumn: number = 0;
		const minimum: number[] = new Array<number>(columnCount + 1).fill(Infinity);
		const used: boolean[] = new Array<boolean>(columnCount + 1).fill(false);

		do {
			used[currentColumn] = true;

			const currentRow: number = columnOwner[currentColumn];
			let delta: number = Infinity;
			let nextColumn: number = 0;

			for(let column: number = 1; column <= columnCount; column++) {
				if(used[column]) continue;

				const reduced: number = cost[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column];

				if(reduced < minimum[column]) {
					minimum[column] = reduced;
					previousColumn[column] = currentColumn;
				}

				if(minimum[column] < delta) {
					delta = minimum[column];
					nextColumn = column;
				}
			}

			for(let column: number = 0; column <= columnCount; column++) {
				if(used[column]) {
					rowPotential[columnOwner[column]] += delta;
					columnPotential[column] -= delta;
				} else {
					minimum[column] -= delta;
				}
			}

			currentColumn = nextColumn;
		} while(columnOwner[currentColumn] !== 0);

		do {
			const nextColumn: number = previousColumn[currentColumn];

			columnOwner[currentColumn] = columnOwner[nextColumn];
			currentColumn = nextColumn;
		} while(currentColumn !== 0);
	}

	const assignment: number[] = new Array<number>(rowCount).fill(-1);

	for(let column: number = 1; column <= columnCount; column++) {
		if(columnOwner[column] > 0) {
			assignment[columnOwner[column] - 1] = column - 1;
		}
	}

	return assignment;
}